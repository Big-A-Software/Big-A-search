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

const websites = JSON.parse(
    fs.readFileSync("data/sites.json", "utf8")
);

const searchIndex = [];
const visitedPages = new Set();
const robotsCache = new Map();


/*
 * Does this URL belong to this approved domain?
 *
 * hp.com allows:
 *   hp.com
 *   www.hp.com
 *   support.hp.com
 */
function belongsToDomain(url, domain) {
    try {
        const hostname = new URL(url).hostname.toLowerCase();
        domain = domain.toLowerCase();

        return (
            hostname === domain ||
            hostname.endsWith("." + domain)
        );
    } catch {
        return false;
    }
}


/*
 * Convert links such as "/downloads" into complete URLs.
 */
function makeAbsoluteURL(link, currentPage) {
    try {
        const url = new URL(link, currentPage);

        // Big-A only crawls normal web pages.
        if (url.protocol !== "http:" && url.protocol !== "https:") {
            return null;
        }

        // Fragments do not identify a different page for our purposes.
        url.hash = "";

        return url.href;
    } catch {
        return null;
    }
}


/*
 * Fetch a URL with a timeout so one slow server cannot hold up
 * the entire Big-A crawl.
 */
async function fetchWithTimeout(url) {
    return fetch(url, {
        headers: {
            "User-Agent": USER_AGENT
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
}


/*
 * Read robots.txt for the exact host being crawled.
 * Each subdomain can have its own robots.txt file.
 */
async function getRobotsRules(pageURL) {
    try {
        const page = new URL(pageURL);
        const origin = page.origin;

        if (robotsCache.has(origin)) {
            return robotsCache.get(origin);
        }

        const robotsURL = origin + "/robots.txt";
        const response = await fetchWithTimeout(robotsURL);

        if (!response.ok) {
            robotsCache.set(origin, []);
            return [];
        }

        const robotsText = await response.text();
        const rules = readRobotsFile(robotsText);

        robotsCache.set(origin, rules);
        return rules;

    } catch {
        // If robots.txt cannot be retrieved, Big-A currently treats it
        // as having no explicit disallow rules.
        return [];
    }
}


/*
 * Read the sections of robots.txt that apply to Big-A
 * or to all crawlers (*).
 */
function readRobotsFile(text) {
    const lines = text.split(/\r?\n/);
    const rules = [];

    let appliesToBigA = false;

    for (let line of lines) {

        // Remove comments.
        line = line.split("#")[0].trim();

        if (!line) {
            continue;
        }

        const separator = line.indexOf(":");

        if (separator === -1) {
            continue;
        }

        const command =
            line.substring(0, separator)
                .trim()
                .toLowerCase();

        const value =
            line.substring(separator + 1)
                .trim();


        if (command === "user-agent") {

            const agent = value.toLowerCase();

            appliesToBigA =
                agent === "*" ||
                agent.includes("big-a-search-crawler");
        }


        if (
            appliesToBigA &&
            command === "disallow" &&
            value !== ""
        ) {
            rules.push(value);
        }
    }

    return rules;
}


/*
 * Check whether robots.txt permits this page.
 */
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


/*
 * Find links in an HTML page.
 */
function findLinks(html, currentPage, domain) {
    const links = [];

    const linkPattern =
        /<a\s+(?:[^>]*?\s+)?href=["']([^"'#]+)["']/gi;

    let match;

    while ((match = linkPattern.exec(html)) !== null) {

        const url =
            makeAbsoluteURL(match[1], currentPage);

        if (
            url &&
            belongsToDomain(url, domain)
        ) {
            links.push(url);
        }
    }

    return links;
}


/*
 * Decode a few common HTML entities so search results look cleaner.
 */
function decodeHTML(text) {
    return text
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, "\"")
        .replace(/&#39;/gi, "'")
        .replace(/&apos;/gi, "'")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">");
}


/*
 * Remove HTML markup and obtain searchable text.
 */
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


/*
 * Read the page title.
 */
function getPageTitle(html, url) {
    const match =
        html.match(/<title[^>]*>(.*?)<\/title>/is);

    return match
        ? decodeHTML(match[1].trim())
        : url;
}


/*
 * Crawl one approved domain.
 */
async function crawlWebsite(domain) {

    console.log("");
    console.log("Crawling:", domain);

    const startingURL =
        "https://" + domain + "/";

    const pagesToVisit = [startingURL];

    let pagesCrawled = 0;


    while (
        pagesToVisit.length > 0 &&
        pagesCrawled < MAX_PAGES_PER_SITE
    ) {

        const url = pagesToVisit.shift();


        if (visitedPages.has(url)) {
            continue;
        }

        visitedPages.add(url);


        // Respect robots.txt for this exact host/subdomain.
        const robotsRules = await getRobotsRules(url);

        if (!robotsAllows(url, robotsRules)) {
            console.log("Blocked by robots.txt:", url);
            continue;
        }


        try {

            console.log("Visiting:", url);

            const response = await fetchWithTimeout(url);


            if (!response.ok) {
                console.log(
                    "Skipped:",
                    response.status,
                    url
                );

                continue;
            }


            const contentType =
                response.headers.get("content-type") || "";


            if (!contentType.includes("text/html")) {
                continue;
            }


            const html =
                await response.text();

            const title =
                getPageTitle(html, url);

            const text =
                getPageText(html);


            searchIndex.push({
                title: title,
                url: url,
                description: text.substring(0, 300)
            });


            pagesCrawled++;

            console.log("Indexed:", title);


            const links =
                findLinks(html, url, domain);


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


    console.log(
        "Finished:",
        domain,
        "(" + pagesCrawled + " pages)"
    );
}


/*
 * Run Big-A Search Crawler.
 */
async function startCrawler() {

    console.log("");
    console.log("========================");
    console.log(" Big-A Search Crawler");
    console.log("========================");


    for (const domain of websites) {
        await crawlWebsite(domain);
    }


    fs.writeFileSync(
        "data/index.json",
        JSON.stringify(searchIndex, null, 4)
    );


    console.log("");
    console.log(
        "Finished!",
        searchIndex.length,
        "pages indexed."
    );
}


startCrawler();
