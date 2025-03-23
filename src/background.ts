// background script for recall chrome extension
// process data from content scripts, store it, manage extension

import type { KeywordNode, MentionNode, WebsiteNode } from "~/types";

interface ExtractedPageData {
  url: string;
  title: string;
  favicon: string;
  keywords: string[];
  mentions: Array<{
    text: string;
    context: string;
  }>;
  mainContent?: string; // optional field for content classification
}

interface UserPreferences {
  trackedDomains: string[];
  excludedDomains: string[];
  enabled: boolean;
  preferences?: string; // user's content preferences for classification
}

// track current active tab
let currentTabId: number | null = null;
let currentTabUrl: string | null = null;

// user prefs with defaults
let userPreferences: UserPreferences = {
  trackedDomains: [], // empty = track all domains not specifically excluded
  excludedDomains: [
    "chrome://",
    "chrome-extension://",
    "edge://",
    "about:",
    "file://",
    "localhost",
    "127.0.0.1",
    "192.168.",
  ],
  enabled: true,
  preferences: "", // default empty, set from popup
};

// track api keys
let geminiApiKey = "";
let cohereApiKey = "";

// load prefs when extension starts
const loadPreferences = () => {
  chrome.storage.local.get(
    ["userPreferences", "geminiApiKey", "cohereApiKey", "preferences"],
    (result) => {
      if (result.userPreferences) {
        userPreferences = {
          ...userPreferences,
          ...result.userPreferences,
        };
        console.log("Loaded user preferences:", userPreferences);
      }

      if (result.geminiApiKey) {
        geminiApiKey = result.geminiApiKey;
        console.log("Loaded Gemini API key");
      }

      if (result.cohereApiKey) {
        cohereApiKey = result.cohereApiKey;
        console.log("Loaded Cohere API key");
      }

      if (result.preferences) {
        userPreferences.preferences = result.preferences;
        console.log("Loaded content preferences");
      }

      // save default prefs if none exist
      savePreferences();
    }
  );
};

// save current prefs
const savePreferences = () => {
  chrome.storage.local.set({ userPreferences }, () => {
    console.log("Saved user preferences:", userPreferences);
  });
};

// initialize
loadPreferences();

// listen for pref changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local") {
    if (changes.userPreferences) {
      userPreferences = changes.userPreferences.newValue;
      console.log("Updated user preferences:", userPreferences);

      // clear graph data cache when prefs change to force re-filtering
      clearGraphDataCache();
    }
    if (changes.geminiApiKey) {
      geminiApiKey = changes.geminiApiKey.newValue;
      console.log("Updated Gemini API key");
    }
    if (changes.cohereApiKey) {
      cohereApiKey = changes.cohereApiKey.newValue;
      console.log("Updated Cohere API key");
    }
    if (changes.preferences) {
      userPreferences.preferences = changes.preferences.newValue;
      console.log("Updated content preferences");

      // clear graph data cache when prefs change to force re-filtering
      clearGraphDataCache();
    }
  }
});

// function to clear graph data cache
function clearGraphDataCache() {
  // clear cached layout from memory for graph component
  chrome.storage.local.get("graphData", (result) => {
    // reset graph data to force refresh
    chrome.storage.local.set({ graphDataCache: null }, () => {
      console.log("Cleared graph data cache due to preference change");
    });
  });
}

// extract domain from url
const extractDomain = (url: string): string => {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (error) {
    console.error("Error extracting domain from URL:", error);
    return "";
  }
};

// check if url should be tracked based on prefs and content classification
const shouldTrackUrl = async (
  url: string,
  pageContent?: string
): Promise<boolean> => {
  try {
    if (!userPreferences.enabled) {
      console.log("Tracking disabled in preferences");
      return false;
    }

    const domain = extractDomain(url);
    if (!domain) return false;

    // check if domain explicitly excluded
    for (const excluded of userPreferences.excludedDomains) {
      if (url.startsWith(excluded) || domain.includes(excluded)) {
        console.log(
          `URL excluded because it matches excluded pattern: ${excluded}`
        );
        return false;
      }
    }

    // if tracking specific domains, check if this one included
    if (userPreferences.trackedDomains.length > 0) {
      const domainMatched = userPreferences.trackedDomains.some((tracked) =>
        domain.includes(tracked)
      );

      if (!domainMatched) {
        console.log(
          `URL excluded because it doesn't match any tracked domains: ${domain}`
        );
        return false;
      }

      console.log(`URL matched tracked domain: ${domain}`);
    }

    // debug log for domains being tracked
    console.log(`Tracking URL with domain: ${domain}`);

    // if we have user prefs and api key, check content after
    // content script extracts full page data, not here
    return true;
  } catch (error) {
    console.error("Error processing URL for tracking:", error);
    return false;
  }
};

// use gemini api to check if content relevant to user prefs
async function isContentRelevantToUserPreferences(
  pageContent: string
): Promise<boolean> {
  if (!geminiApiKey || !userPreferences.preferences) {
    console.log("No API key or preferences set, defaulting to include content");
    return true; // default to include if no api key or prefs
  }

  try {
    // extract better summary of page content
    const contentSummary = pageContent.substring(0, 4000); // increase content analysis

    // use gemini api for better content classification
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": geminiApiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `
I need you to analyze a webpage and determine if it meets specific user interests.

USER INTERESTS:
${userPreferences.preferences}

WEBPAGE CONTENT SAMPLE:
${contentSummary}

Your task: 
1. Analyze if this webpage content is relevant to the user's stated interests
2. Respond with ONLY "relevant" or "irrelevant" based on your analysis
            `,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 10,
          },
        }),
      }
    );

    if (!response.ok) {
      console.error("Error from Gemini API:", await response.text());
      return true; // default to include on error
    }

    const data = await response.json();

    // extract classification from gemini response
    let responseText = "";
    try {
      responseText = data.candidates[0].content.parts[0].text
        .trim()
        .toLowerCase();
      console.log("Gemini classification result:", responseText);
    } catch (e) {
      console.error("Error parsing Gemini response:", e, data);
      return true; // default to include if can't parse response
    }

    // check if response contains "relevant"
    const isRelevant =
      responseText.includes("relevant") && !responseText.includes("irrelevant");

    console.log(
      "Content classification result:",
      isRelevant ? "RELEVANT" : "IRRELEVANT"
    );

    return isRelevant;
  } catch (error) {
    console.error("Error classifying content:", error);
    return true; // default to include on error
  }
}

// listen for tab updates to detect user navigation to new page
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // only process if tab completed loading and has url
  if (changeInfo.status === "complete" && tab.url) {
    // track initial check based on url patterns
    if (shouldTrackUrl(tab.url)) {
      // track current tab
      currentTabId = tabId;
      currentTabUrl = tab.url;

      console.log(`Processing tab ${tabId} with URL: ${tab.url}`);

      // request data from content script
      setTimeout(() => {
        chrome.tabs.sendMessage(
          tabId,
          { action: "getPageData" },
          (response) => {
            if (chrome.runtime.lastError) {
              console.log(
                "Error sending message to content script",
                chrome.runtime.lastError
              );
              return;
            }

            if (response && response.success) {
              // only process if we have api key and prefs - strict requirement
              if (geminiApiKey && userPreferences.preferences) {
                processPageData(response.data);
              } else {
                console.log("Skipping content - no API key or preferences set");
              }
            }
          }
        );
      }, 1500); // small delay to ensure content script has time to process
    } else {
      console.log(`Not tracking tab ${tabId} with URL: ${tab.url}`);
    }
  }
});

// listen for tab activation to track current tab
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (tab.url && shouldTrackUrl(tab.url)) {
      currentTabId = activeInfo.tabId;
      currentTabUrl = tab.url;
    }
  });
});

// handle message from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "savePageData") {
    const tabId = sender.tab?.id;
    if (!tabId) {
      console.error("No tab ID for message");
      sendResponse({ success: false, reason: "No tab ID" });
      return;
    }

    const data = message.data as ExtractedPageData;
    console.log("Received page data from content script:", data);

    // process this async
    (async () => {
      try {
        // prepare content for classification, prioritize mainContent if available
        const pageContent =
          data.mainContent ||
          [
            data.title,
            data.url,
            ...data.keywords,
            ...data.mentions.map((m) => `${m.text}: ${m.context}`),
          ].join(" ");

        // only do content filtering if we have prefs set
        if (userPreferences.preferences && geminiApiKey) {
          const isRelevant =
            await isContentRelevantToUserPreferences(pageContent);

          if (!isRelevant) {
            console.log("Content doesn't match user preferences, skipping");
            sendResponse({
              success: false,
              reason: "Content doesn't match user preferences",
            });
            return;
          }

          console.log("Content matches user preferences, will save to graph");
        }

        // if here, process the page data
        await processPageData(data);
        sendResponse({ success: true });
      } catch (error) {
        console.error("Error processing page data:", error);
        sendResponse({
          success: false,
          reason: `Error: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    })();

    return true; // keep messaging channel open for async response
  } else if (message.action === "updatePreferences") {
    if (message.preferences) {
      userPreferences = {
        ...userPreferences,
        ...message.preferences,
      };
      savePreferences();
      sendResponse({ success: true });
    }
  } else if (message.action === "getPreferences") {
    sendResponse({ success: true, preferences: userPreferences });
  } else if (message.action === "resetBrowsingData") {
    console.log("Background: Received request to reset browsing data");
    try {
      // create empty graph data
      const emptyGraphData = {
        websites: [],
        keywords: [],
        mentions: [],
        websiteToKeywordEdges: [],
        websiteToMentionEdges: [],
      };

      // directly set to empty graph data
      chrome.storage.local.set({ graphData: emptyGraphData }, () => {
        console.log("Background: Graph data reset successfully");
        sendResponse({ success: true });
      });
    } catch (error) {
      console.error("Background: Error resetting data:", error);
      sendResponse({ success: false, error: String(error) });
    }

    return true; // keep messaging channel open for async response
  }
});

// process extracted page data and store it
async function processPageData(data: ExtractedPageData): Promise<void> {
  console.log("Processing page data:", data);

  try {
    // prepare content for classification
    const pageContent = [
      data.title,
      data.url,
      ...(data.mainContent ? [data.mainContent.substring(0, 4000)] : []),
      ...data.keywords,
      ...data.mentions.map((m) => `${m.text}: ${m.context}`),
    ].join(" ");

    // strict content filtering check
    if (!userPreferences.preferences || !geminiApiKey) {
      console.log("No content preferences or API key set, skipping");
      return;
    }

    // check if content matches user prefs
    const isRelevant = await isContentRelevantToUserPreferences(pageContent);

    if (!isRelevant) {
      console.log("Content doesn't match user preferences, skipping");
      return;
    }

    console.log("Content matches user preferences, saving to graph data");

    // get storage api
    const storage = chrome.storage.local;

    // get current graph data
    storage.get("graphData", (result) => {
      let graphData = result.graphData || {
        websites: [],
        keywords: [],
        mentions: [],
        websiteToKeywordEdges: [],
        websiteToMentionEdges: [],
      };

      console.log(
        "Current graph data:",
        JSON.stringify(graphData).substring(0, 100) + "..."
      );

      // check if already have this website
      const existingWebsiteIndex = graphData.websites.findIndex(
        (website: WebsiteNode) => website.url === data.url
      );

      let websiteId: string;

      if (existingWebsiteIndex >= 0) {
        // update existing website
        websiteId = graphData.websites[existingWebsiteIndex].id;
        graphData.websites[existingWebsiteIndex].title = data.title;
        graphData.websites[existingWebsiteIndex].favicon = data.favicon;
        graphData.websites[existingWebsiteIndex].visitedAt = Date.now();
      } else {
        // create new website node
        websiteId = `website-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        graphData.websites.push({
          id: websiteId,
          url: data.url,
          title: data.title,
          favicon: data.favicon,
          visitedAt: Date.now(),
        });
      }

      // process keywords
      const existingKeywords = graphData.keywords.filter(
        (keyword: KeywordNode) => keyword.sourceWebsiteId === websiteId
      );

      // remove old keywords from this website
      graphData.keywords = graphData.keywords.filter(
        (keyword: KeywordNode) => keyword.sourceWebsiteId !== websiteId
      );

      // remove old keyword edges
      graphData.websiteToKeywordEdges = graphData.websiteToKeywordEdges.filter(
        (edge: any) => edge.source !== websiteId
      );

      // save positions of existing keywords for this website
      const keywordPositions: { [key: string]: any } = {};
      existingKeywords.forEach((keyword: KeywordNode) => {
        keywordPositions[keyword.text.toLowerCase()] = keyword.position;
      });

      // process each keyword from page
      for (const keywordText of data.keywords) {
        // skip empty or very short keywords
        if (!keywordText || keywordText.length < 3) continue;

        const normalizedText = keywordText.toLowerCase();

        // check if keyword already exists in graph
        let existingKeyword = graphData.keywords.find(
          (k: KeywordNode) => k.text.toLowerCase() === normalizedText
        );

        let keywordId: string;

        if (existingKeyword) {
          // use existing keyword
          keywordId = existingKeyword.id;
        } else {
          // create new keyword node
          keywordId = `keyword-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

          graphData.keywords.push({
            id: keywordId,
            text: keywordText,
            position: keywordPositions[normalizedText],
          });
        }

        // add edge from website to keyword
        graphData.websiteToKeywordEdges.push({
          id: `edge-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          source: websiteId,
          target: keywordId,
        });
      }

      // process mentions
      const existingMentions = graphData.mentions.filter(
        (mention: MentionNode) => mention.sourceWebsiteId === websiteId
      );

      // remove old mentions from this website
      graphData.mentions = graphData.mentions.filter(
        (mention: MentionNode) => mention.sourceWebsiteId !== websiteId
      );

      // remove old mention edges
      graphData.websiteToMentionEdges = graphData.websiteToMentionEdges.filter(
        (edge: any) => edge.source !== websiteId
      );

      // add new mentions
      for (const mentionData of data.mentions) {
        // skip empty mentions or those with invalid context
        if (
          !mentionData.text ||
          mentionData.text.length < 2 ||
          !mentionData.context
        )
          continue;

        // reuse existing position if mention text same
        const existingMention = existingMentions.find(
          (m: MentionNode) =>
            m.text.toLowerCase() === mentionData.text.toLowerCase()
        );

        const mentionId = `mention-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

        // add mention to graph
        graphData.mentions.push({
          id: mentionId,
          text: mentionData.text,
          context: mentionData.context,
          sourceWebsiteId: websiteId,
          position: existingMention?.position,
        });

        // add edge from website to mention
        graphData.websiteToMentionEdges.push({
          id: `edge-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          source: websiteId,
          target: mentionId,
        });
      }

      // make sure graphData has all required arrays to prevent render errors
      graphData.websites = graphData.websites || [];
      graphData.keywords = graphData.keywords || [];
      graphData.mentions = graphData.mentions || [];
      graphData.websiteToKeywordEdges = graphData.websiteToKeywordEdges || [];
      graphData.websiteToMentionEdges = graphData.websiteToMentionEdges || [];

      // ensure at least one node and edge for testing - helps with debugging
      if (
        graphData.websites.length > 0 &&
        graphData.websiteToKeywordEdges.length === 0 &&
        graphData.keywords.length === 0
      ) {
        // create test keyword if none exist
        const testKeywordId = `keyword-test-${Date.now()}`;
        graphData.keywords.push({
          id: testKeywordId,
          text: "Test Keyword",
          sourceWebsiteId: graphData.websites[0].id,
        });

        // create test edge
        graphData.websiteToKeywordEdges.push({
          id: `edge-test-${Date.now()}`,
          source: graphData.websites[0].id,
          target: testKeywordId,
        });

        console.log("Added test keyword and edge to ensure graph renders");
      }

      console.log(
        `Saving graph data with ${graphData.websites.length} websites, ${graphData.keywords.length} keywords, ${graphData.websiteToKeywordEdges.length} edges`
      );

      // store updated graph data
      storage.set({ graphData }, () => {
        if (chrome.runtime.lastError) {
          console.error("Error saving graph data:", chrome.runtime.lastError);
        } else {
          console.log("Graph data saved successfully");

          // create timestamp-based cache key to force graph refresh
          const graphDataCache = {
            timestamp: Date.now(),
            nodeCount:
              graphData.websites.length +
              graphData.keywords.length +
              graphData.mentions.length,
          };

          // save cache metadata to trigger refresh in ui
          storage.set({ graphDataCache }, () => {
            console.log(
              "Graph data cache updated with timestamp:",
              graphDataCache.timestamp
            );
          });
        }
      });
    });
  } catch (error) {
    console.error("Error processing page data:", error);
  }
}
