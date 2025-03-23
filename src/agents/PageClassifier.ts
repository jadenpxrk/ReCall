import type { KeywordNode, MentionNode, WebsiteNode } from "~/types";

interface ClassifierConfig {
  cohereApiKey: string;
  userPreferences?: string;
}

interface ScoredDocument<T> {
  document: T;
  score: number;
}

/**
 * PageClassifier uses Cohere API for semantic search and content relevance classification
 */
export class PageClassifier {
  private cohereApiKey: string;
  private userPreferences: string;

  constructor(config: ClassifierConfig) {
    this.cohereApiKey = config.cohereApiKey;
    this.userPreferences = config.userPreferences || "";
  }

  /**
   * Determines if content is relevant to user preferences using Cohere's classification
   */
  async isContentRelevant(
    pageContent: string,
    threshold = 0.6
  ): Promise<boolean> {
    if (!this.cohereApiKey || !this.userPreferences) {
      return true; // Default to including if we don't have API key or preferences
    }

    try {
      // chunk the first bit --> probably don't wanna do entire cuz that's a lot of tokens
      const contentSummary = pageContent.substring(0, 2000);

      // use Cohere's classification API
      const response = await fetch("https://api.cohere.ai/v1/classify", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.cohereApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "large",
          inputs: [contentSummary],
          examples: [
            {
              text: "This is an example of content that matches the user's preferences.",
              label: "relevant",
            },
            {
              text: "This is an example of content that doesn't match the user's preferences.",
              label: "irrelevant",
            },
          ],
          // add the user's preferences as context
          context: `The user is interested in: ${this.userPreferences}. 
                 Classify the content as 'relevant' if it aligns with these preferences or 'irrelevant' if it doesn't.`,
        }),
      });

      if (!response.ok) {
        console.error("Error from Cohere API:", await response.text());
        return true; // Default to including on error
      }

      const data = await response.json();
      const classification = data.classifications[0];

      // log the classification result
      console.log("Content classification:", classification);

      // check if the prediction is 'relevant' and the confidence is above threshold
      return (
        classification.prediction === "relevant" &&
        classification.confidence >= threshold
      );
    } catch (error) {
      console.error("Error classifying content:", error);
      return true; // Default to including on error
    }
  }

  /**
   * Ranks browsing data based on relevance to a query using Cohere's rerank API
   */
  async rankBrowsingData(
    query: string,
    websites: WebsiteNode[],
    keywords: KeywordNode[],
    mentions: MentionNode[],
    maxResults = 10
  ) {
    try {
      if (!this.cohereApiKey) {
        console.log("No Cohere API key available for ranking");
        return {
          websites,
          keywords,
          mentions,
        };
      }

      // prepare documents for Cohere reranking
      const websiteDocs = websites.map((site, index) => ({
        id: site.id,
        text: `${site.title} - ${site.url}`,
        type: "website",
        originalIndex: index,
      }));

      const keywordDocs = keywords.map((kw, index) => ({
        id: kw.id,
        text: kw.text,
        type: "keyword",
        originalIndex: index,
      }));

      const mentionDocs = mentions.map((mention, index) => ({
        id: mention.id,
        text: `${mention.text}: ${mention.context}`,
        type: "mention",
        originalIndex: index,
      }));

      // merge
      const allDocs = [...websiteDocs, ...keywordDocs, ...mentionDocs];

      // skip if no documents to rank
      if (allDocs.length === 0) {
        return {
          websites,
          keywords,
          mentions,
        };
      }

      // rerank
      const response = await fetch("https://api.cohere.ai/v1/rerank", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.cohereApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "rerank-english-v3.0",
          query,
          documents: allDocs.map((doc) => doc.text),
          top_n: Math.min(maxResults, allDocs.length),
          return_documents: true,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Error from Cohere Rerank API:", errorText);
        return {
          websites,
          keywords,
          mentions,
        };
      }

      // process response
      const data = await response.json();
      const results = data.results || [];

      // group results by type
      const rankedWebsites: ScoredDocument<WebsiteNode>[] = [];
      const rankedKeywords: ScoredDocument<KeywordNode>[] = [];
      const rankedMentions: ScoredDocument<MentionNode>[] = [];

      results.forEach((result: any) => {
        const docIndex = result.index;
        const originalDoc = allDocs[docIndex];
        const relevanceScore = result.relevance_score;

        if (
          originalDoc.type === "website" &&
          originalDoc.originalIndex < websites.length
        ) {
          rankedWebsites.push({
            document: websites[originalDoc.originalIndex],
            score: relevanceScore,
          });
        } else if (
          originalDoc.type === "keyword" &&
          originalDoc.originalIndex < keywords.length
        ) {
          rankedKeywords.push({
            document: keywords[originalDoc.originalIndex],
            score: relevanceScore,
          });
        } else if (
          originalDoc.type === "mention" &&
          originalDoc.originalIndex < mentions.length
        ) {
          rankedMentions.push({
            document: mentions[originalDoc.originalIndex],
            score: relevanceScore,
          });
        }
      });

      // if we didn't get any results for a category, keep the original
      const finalWebsites =
        rankedWebsites.length > 0
          ? rankedWebsites.map((item) => item.document)
          : websites;

      const finalKeywords =
        rankedKeywords.length > 0
          ? rankedKeywords.map((item) => item.document)
          : keywords;

      const finalMentions =
        rankedMentions.length > 0
          ? rankedMentions.map((item) => item.document)
          : mentions;

      return {
        websites: finalWebsites,
        keywords: finalKeywords,
        mentions: finalMentions,
      };
    } catch (error) {
      console.error("Error with Cohere ranking:", error);
      return {
        websites,
        keywords,
        mentions,
      };
    }
  }

  /**
   * Performs semantic search on browsing data using Cohere's Embed API
   */
  async semanticSearch(
    query: string,
    websites: WebsiteNode[],
    keywords: KeywordNode[],
    mentions: MentionNode[],
    maxResults = 10
  ) {
    // for now, this is just a wrapper around rankBrowsingData
    // in a future version, we could implement more advanced embedding-based search
    return this.rankBrowsingData(
      query,
      websites,
      keywords,
      mentions,
      maxResults
    );
  }
}

export default PageClassifier;
