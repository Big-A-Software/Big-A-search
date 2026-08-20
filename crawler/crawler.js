/*
 * Big-A Search Crawler
 *
 * Copyright 2024-2026 Big-A
 * Licensed under the Apache License, Version 2.0.
 */

const fs = require("fs");

const MAX_PAGES_PER_SITE = 25;
const REQUEST_TIMEOUT_MS = 10000;
const USER_AGENT = "Big-A-Search-Crawler/0.1 (+https://search.big-a.dev/)";

const SITES_FILE = "data/sites.json";
const INDEX_FILE = "data/index.json";
const CRAWLED_SITES_FILE = "data/crawled-sites.json";

const websites = JSON.parse(fs.readFileSync(SITES_FILE, "utf8"));

// Keep the existing index instead of rebuilding it from scratch.
const searchIndex = fs.existsSync(INDEX_FILE)
    ? JSON.parse(fs.readFileSync(INDEX_FILE, "utf8"))
    : [];

// This file remembers which domains Big-A has already attempted.
const crawledSites = fs.existsSync(CRAWLED_SITES_FILE)
    ? JSON.parse(fs.readFileSync(CRAWLED_SITES_FILE, "utf8"))
    : [];

const crawledSet = new Set(
    crawledSites.map(domain => domain.toLowerCase())
);

const visitedPages = new Set();
const robotsCache = new Map();


function belongsToDomain(url, domain) {
    try {
        const hostname = new URL(url).hostname.toLowerCase();
        domain = domain.toLowerCase();

        return hostname === domain || hostname.endsWith("." + domain);
    } catch {
        return false;
    }
}


function makeAbsoluteURL(link, currentPage) {
    try {
        const url = new URL(link, currentPage);

        if (url.protocol !== "http:" && url.protocol !== "https:") {
            return null;
        }

        url.hash = "";
        return url.href;
    } catch {
        return null;
    }
}


async function fetchWithTimeout(url) {
    return fetch(url, {
        headers: {
            "User-Agent": USER_AGENT
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
}


async function getRobotsRules(pageURL) {
    try {
        const page = new URL(pageURL);
        const origin = page.origin;

        if (robotsCache.has(origin)) {
            return robotsCache.get(origin);
        }

        const response = await fetchWithTimeout(origin + "/robots.txt");

        if (!response.ok) {
            robotsCache.set(origin, []);
            return [];
        }

        const rules = readRobotsFile(await response.text());
        robotsCache.set(origin, rules);
        return rules;

    } catch {
        return [];
    }
}


function readRobotsFile(text) {
    const lines = text.split(/\r?\n/);
    const rules = [];
    let appliesToBigA = false;

    for (let line of lines) {
        line = line.split("#")[0].trim();

        if (!line) continue;

        const separator = line.indexOf(":");
        if (separator === -1) continue;

        const command = line.substring(0, separator).trim().toLowerCase();
        const value = line.substring(separator + 1).trim();

        if (command === "user-agent") {
            const agent = value.toLowerCase();
            appliesToBigA =
                agent === "*" ||
                agent.includes("big-a-search-crawler");
        }

        if (appliesToBigA && command === "disallow" && value !== "") {
            rules.push(value);
        }
    }

    return rules;
}


function robotsAllows(url, disallowedPaths) {
    try {
        const page = new URL(url);

        for (const path of disallowedPaths) {
            if (page.pathname.startsWith(path)) {
                return false;
            }
        }

        return true;
    } catch {
        return false;
    }
}


function findLinks(html, currentPage, domain) {
    const links = [];
    const linkPattern = /<a\s+(?:[^>]*?\s+)?href=["']([^"'#]+)["']/gi;
    let match;

    while ((match = linkPattern.exec(html)) !== null) {
        const url = makeAbsoluteURL(match[1], currentPage);

        if (url && belongsToDomain(url, domain)) {
            links.push(url);
        }
    }

    return links;
}


function decodeHTML(text) {
    return text
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, "\"")
        .replace(/&#39;/gi, "'")
        .replace(/&apos;/gi, "'")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">");
}


function getPageText(html) {
    return decodeHTML(
        html
            .replace(/<script[\s\S]*?<\/script>/gi, " ")
            .replace(/<style[\s\S]*?<\/style>/gi, " ")
            .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
    );
}


function getPageTitle(html, url) {
    const match = html.match(/<title[^>]*>(.*?)<\/title>/is);
    return match ? decodeHTML(match[1].trim()) : url;
}


async function crawlWebsite(domain) {
    console.log("");
    console.log("Crawling NEW domain:", domain);

    const startingURL = "https://" + domain + "/";
    const pagesToVisit = [startingURL];
    let pagesCrawled = 0;

    while (pagesToVisit.length > 0 && pagesCrawled < MAX_PAGES_PER_SITE) {
        const url = pagesToVisit.shift();

        if (visitedPages.has(url)) continue;
        visitedPages.add(url);

        const robotsRules = await getRobotsRules(url);

        if (!robotsAllows(url, robotsRules)) {
            console.log("Blocked by robots.txt:", url);
            continue;
        }

        try {
            console.log("Visiting:", url);

            const response = await fetchWithTimeout(url);

            if (!response.ok) {
                console.log("Skipped:", response.status, url);
                continue;
            }

            const contentType = response.headers.get("content-type") || "";
            if (!contentType.includes("text/html")) continue;

            const html = await response.text();
            const title = getPageTitle(html, url);
            const text = getPageText(html);

            searchIndex.push({
                title: title,
                url: url,
                description: text.substring(0, 300)
            });

            pagesCrawled++;
            console.log("Indexed:", title);

            const links = findLinks(html, url, domain);

            for (const link of links) {
                if (!visitedPages.has(link)) {
                    pagesToVisit.push(link);
                }
            }

        } catch (error) {
            console.log("Could not crawl:", url);

            if (error.name === "TimeoutError") {
                console.log("Request timed out after", REQUEST_TIMEOUT_MS, "ms");
            } else {
                console.log(error.message);
            }
        }
    }

    console.log("Finished:", domain, "(" + pagesCrawled + " pages)");
    return pagesCrawled;
}


async function startCrawler() {
    console.log("");
    console.log("========================");
    console.log(" Big-A Search Crawler");
    console.log("========================");

    const newDomains = websites.filter(
        domain => !crawledSet.has(domain.toLowerCase())
    );

    console.log("Domains listed:", websites.length);
    console.log("Already processed:", crawledSet.size);
    console.log("New domains to crawl:", newDomains.length);

    if (newDomains.length === 0) {
        console.log("Nothing new to crawl.");
        return;
    }

    for (const domain of newDomains) {
        await crawlWebsite(domain);

        // Mark the domain as processed even if it returned zero pages.
        // This prevents blocked or unavailable sites from being retried every hour.
        crawledSet.add(domain.toLowerCase());
    }

    fs.writeFileSync(
        INDEX_FILE,
        JSON.stringify(searchIndex, null, 4)
    );

    fs.writeFileSync(
        CRAWLED_SITES_FILE,
        JSON.stringify(Array.from(crawledSet).sort(), null, 4)
    );

    console.log("");
    console.log("Finished!");
    console.log("New domains processed:", newDomains.length);
    console.log("Total pages in Big-A index:", searchIndex.length);
}


startCrawler();
