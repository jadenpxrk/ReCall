// parse content from webpage

import type { KeywordNode, MentionNode, WebsiteNode } from "~/types";

// time to wait before processing page (ms)
const PROCESSING_DELAY = 1000;

// define interface for extracted page data
interface ExtractedPageData {
  url: string;
  title: string;
  favicon: string;
  keywords: string[];
  mentions: Array<{
    text: string;
    context: string;
  }>;
  mainContent: string;
}

// main function to extract data from current page
function extractPageData(): ExtractedPageData {
  const url = window.location.href;
  const title = document.title;
  const favicon = getFavicon();
  const keywords = extractKeywords();
  const mentions = extractImportantMentions();
  const mainContent = extractMainContent();

  return {
    url,
    title,
    favicon,
    keywords,
    mentions,
    mainContent,
  };
}

// get favicon url
function getFavicon(): string {
  // try to get favicon from link elements
  const faviconEl =
    document.querySelector('link[rel="icon"]') ||
    document.querySelector('link[rel="shortcut icon"]');

  if (faviconEl && faviconEl.getAttribute("href")) {
    const faviconHref = faviconEl.getAttribute("href") as string;

    // if favicon url is relative, convert to absolute
    if (faviconHref.startsWith("/")) {
      return `${window.location.origin}${faviconHref}`;
    }

    return faviconHref;
  }

  // default to standard favicon location
  return `${window.location.origin}/favicon.ico`;
}

// extract keywords from meta tags, headings, etc
function extractKeywords(): string[] {
  const keywords: Set<string> = new Set();

  // check meta keywords
  const metaKeywords = document
    .querySelector('meta[name="keywords"]')
    ?.getAttribute("content");
  if (metaKeywords) {
    metaKeywords.split(",").forEach((keyword) => {
      keywords.add(keyword.trim().toLowerCase());
    });
  }

  // special handling for shadcn ui docs
  const isShadcnUI =
    window.location.hostname.includes("ui.shadcn.com") ||
    document.querySelector('a[href^="https://ui.shadcn.com"]') !== null;

  if (isShadcnUI) {
    console.log(
      "Detected Shadcn UI documentation, applying special extraction"
    );

    // extract component names - typically in sidebar
    const sidebarLinks = Array.from(document.querySelectorAll("nav a"));
    sidebarLinks.forEach((link) => {
      const text = link.textContent?.trim();
      if (text && text.length > 2) {
        keywords.add(text.toLowerCase());
      }
    });

    // extract from code examples - often contain component names
    const codeBlocks = Array.from(document.querySelectorAll("pre code"));
    codeBlocks.forEach((codeBlock) => {
      const text = codeBlock.textContent || "";
      // look for react component imports
      const importMatches = text.match(/import\s+{\s*([^}]+)\s*}/);
      if (importMatches && importMatches[1]) {
        const components = importMatches[1].split(",").map((c) => c.trim());
        components.forEach((component) => {
          if (component && component.length > 1) {
            keywords.add(component.toLowerCase());
          }
        });
      }

      // look for component usage like <Button>, <Card>, etc
      const componentMatches = text.match(/<([A-Z][a-zA-Z]*)/g);
      if (componentMatches) {
        componentMatches.forEach((match) => {
          const component = match.substring(1); // remove < character
          if (component && component.length > 1) {
            keywords.add(component.toLowerCase());
          }
        });
      }
    });
  }

  // extract topics from headings - get full heading text as phrase
  const headings = Array.from(document.querySelectorAll("h1, h2, h3"));
  headings.forEach((heading) => {
    const text = heading.textContent?.trim();
    if (text) {
      if (text.length < 40) {
        // add whole heading as phrase if not too long
        keywords.add(text.toLowerCase());
      } else {
        // for longer headings, split into words
        text.split(/\s+/).forEach((word) => {
          if (word.length > 3 && !/^\d+$/.test(word)) {
            // only consider words longer than 3 chars and not just numbers
            keywords.add(word.toLowerCase());
          }
        });
      }
    }
  });

  // extract from strong/bold text
  const emphasisElements = Array.from(
    document.querySelectorAll("strong, b, .font-bold, .font-semibold")
  );
  emphasisElements.forEach((element) => {
    const text = element.textContent?.trim();
    if (text && text.length < 30 && text.length > 2) {
      // only short emphasized text likely to be keyword
      keywords.add(text.toLowerCase());
    }
  });

  // extract from specific elements that might contain important terms
  // helps for documentation sites
  const specialSelectors = [
    ".api-reference .prop-name", // common in api docs
    ".function-name",
    ".component-name",
    ".parameter-name",
    "dt", // definition terms in lists
    "code:not(pre code)", // inline code (excluding code blocks)
  ];

  specialSelectors.forEach((selector) => {
    try {
      const elements = Array.from(document.querySelectorAll(selector));
      elements.forEach((element) => {
        const text = element.textContent?.trim();
        if (text && text.length > 2 && text.length < 30) {
          keywords.add(text.toLowerCase());
        }
      });
    } catch (e) {
      // ignore errors from invalid selectors
    }
  });

  // filter out common stop words and very short terms
  const stopWords = new Set([
    "the",
    "and",
    "or",
    "a",
    "an",
    "in",
    "on",
    "at",
    "by",
    "to",
    "for",
    "with",
    "about",
    "from",
    "as",
    "of",
    "this",
    "that",
    "get",
    "use",
    "using",
  ]);

  const filteredKeywords = Array.from(keywords).filter(
    (keyword) => keyword.length > 2 && !stopWords.has(keyword)
  );

  // convert set back to array and limit to reasonable number
  return filteredKeywords.slice(0, 30);
}

// extract important mentions with context
function extractImportantMentions(): Array<{ text: string; context: string }> {
  const mentions: Array<{ text: string; context: string }> = [];

  // extract from main content paragraphs
  const paragraphs = Array.from(document.querySelectorAll("p"));
  const mainContentParagraphs = paragraphs.filter((p) => {
    // filter out small paragraphs that might be ui elements
    const text = p.textContent?.trim();
    return text && text.length > 100;
  });

  // process paragraphs to find potential mentions
  mainContentParagraphs.forEach((paragraph) => {
    const text = paragraph.textContent?.trim();
    if (text) {
      // look for sentences with technical terms, proper nouns, etc
      const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);

      sentences.forEach((sentence) => {
        // simple heuristic: sentences with capitalized words might have important mentions
        if (
          sentence
            .split(" ")
            .some(
              (word) =>
                word.length > 1 &&
                word[0] === word[0].toUpperCase() &&
                word[0] !== word[0].toLowerCase()
            )
        ) {
          // find "important" part of sentence
          const words = sentence.split(" ");
          const importantParts = words.filter(
            (word) =>
              word.length > 1 &&
              word[0] === word[0].toUpperCase() &&
              word[0] !== word[0].toLowerCase()
          );

          if (importantParts.length > 0) {
            // take first important word and some context
            const mention = importantParts[0];
            const context = sentence.trim();

            // add to mentions array
            mentions.push({
              text: mention,
              context,
            });
          }
        }
      });
    }
  });

  // if we have code blocks, extract as mentions
  const codeBlocks = Array.from(document.querySelectorAll("pre, code"));
  codeBlocks.forEach((codeBlock) => {
    const text = codeBlock.textContent?.trim();
    if (text && text.length > 10 && text.length < 200) {
      // reasonable size for code snippet
      const firstLine = text.split("\n")[0].trim();

      mentions.push({
        text:
          firstLine.length < 50
            ? firstLine
            : firstLine.substring(0, 47) + "...",
        context: text.length < 200 ? text : text.substring(0, 197) + "...",
      });
    }
  });

  // limit to reasonable number
  return mentions.slice(0, 15);
}

// extract main content of page for better classification
function extractMainContent(): string {
  // try to find main content area
  const possibleMainElements = [
    document.querySelector("main"),
    document.querySelector("article"),
    document.querySelector('[role="main"]'),
    document.querySelector("#content"),
    document.querySelector(".content"),
    document.querySelector(".main"),
    document.querySelector(".article"),
    document.querySelector(".post"),
    document.querySelector(".entry"),
    document.body,
  ];

  // use first element that exists
  const mainElement = possibleMainElements.find((el) => el !== null);

  if (!mainElement) return document.body.textContent?.substring(0, 5000) || "";

  // get text content using textContent which is type-safe
  const content = mainElement.textContent || "";

  // return trimmed version to avoid sending too much data
  return content.substring(0, 5000);
}

// function to send data to background script
function sendDataToBackground(data: ExtractedPageData): void {
  chrome.runtime.sendMessage({
    action: "savePageData",
    data,
  });
}

// main execution
function main(): void {
  // wait for page to fully load before extracting data
  setTimeout(() => {
    try {
      const data = extractPageData();
      sendDataToBackground(data);
      console.log(
        "ReCall: Page data extracted and sent to background script",
        data
      );
    } catch (error) {
      console.error("ReCall: Error extracting page data", error);
    }
  }, PROCESSING_DELAY);
}

// execute main function
main();

// listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getPageData") {
    console.log("Content script: Received request for page data");
    try {
      const pageData = extractPageData();
      console.log("Content script: Extracted page data for classification");

      // send extracted data back to background script
      sendResponse({ success: true, data: pageData });
    } catch (error) {
      console.error("Content script: Error extracting page data:", error);
      sendResponse({ success: false, error: String(error) });
    }
  }
  return true; // keep messaging channel open for async response
});

// also listen for dom changes to update data if significant changes happen
let lastUpdateTime = Date.now();
const observer = new MutationObserver((mutations) => {
  // only update if been a while since last update (avoid excessive processing)
  if (Date.now() - lastUpdateTime > 5000) {
    const significantChange = mutations.some(
      (mutation) =>
        mutation.type === "childList" && mutation.addedNodes.length > 0
    );

    if (significantChange) {
      lastUpdateTime = Date.now();
      try {
        const data = extractPageData();
        sendDataToBackground(data);
        console.log("ReCall: Page data updated after DOM changes", data);
      } catch (error) {
        console.error("ReCall: Error updating page data", error);
      }
    }
  }
});

// start observing document with configured parameters
observer.observe(document.body, { childList: true, subtree: true });

// function to analyze page content (if enabled) and send to background script
async function sendPageData() {
  try {
    const pageData = extractPageData();
    console.log("Content script: Extracted page data:", pageData);

    // send message to background script
    chrome.runtime.sendMessage(
      { action: "savePageData", data: pageData },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error(
            "Content script: Error sending data to background:",
            chrome.runtime.lastError
          );
          return;
        }

        if (response && response.success) {
          console.log("Content script: Page data saved successfully");
        } else {
          console.log(
            "Content script: Page data not saved:",
            response?.reason || "unknown reason"
          );
        }
      }
    );
  } catch (error) {
    console.error("Content script: Error extracting page data:", error);
  }
}
