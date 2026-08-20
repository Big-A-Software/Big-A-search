/*
 * Big-A Search Crawler
 *
 * Copyright 2024-2026 Big-A
 * Licensed under the Apache License, Version 2.0.
 *
 * Big-A Search crawls websites listed in data/sites.json
 * and creates data/index.json.
 */

const fs = require("fs");


// Maximum number of pages to crawl from each website.
// We are starting small while Big-A is being tested.
const MAX_PAGES_PER_SITE = 25;


// Load Big-A's website list.
const websites = JSON.parse(
    fs.readFileSync("data/sites.json", "utf8")
);


// This will become Big-A's search index.
const searchIndex = [];


// Keep track of pages we have already visited.
const visitedPages = new Set();


/*
 * Check whether a URL belongs to an approved domain.
 *
 * If "hp.com" is approved, these are allowed:
 *
 * hp.com
 * www.hp.com
 * support.hp.com
 *
 * But example.com is not allowed.
 */
function belongsToDomain(url, domain) {

    try {

        const hostname =
            new URL(url).hostname.toLowerCase();

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
 * Turn a relative link into a complete URL.
 *
 * Example:
 *
 * /downloads/
 *
 * becomes:
 *
 * https://softpedia.com/downloads/
 */
function makeAbsoluteURL(link, currentPage) {

    try {
        return new URL(link, currentPage).href;
    } catch {
        return null;
    }
}


/*
 * Find links inside a webpage.
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
 * Get readable text from HTML.
 */
function getPageText(html) {

    return html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}


/*
 * Find the page title.
 */
function getPageTitle(html, url) {

    const titleMatch =
        html.match(/<title[^>]*>(.*?)<\/title>/is);


    if (titleMatch) {
        return titleMatch[1].trim();
    }


    return url;
}


/*
 * Crawl one approved domain.
 */
async function crawlWebsite(domain) {

    console.log("");
    console.log("Crawling website:", domain);


    const pagesToVisit = [
        "https://" + domain + "/"
    ];


    let pagesCrawled = 0;


    while (
        pagesToVisit.length > 0 &&
        pagesCrawled < MAX_PAGES_PER_SITE
    ) {

        const url = pagesToVisit.shift();


        // Don't visit the same page twice.
        if (visitedPages.has(url)) {
            continue;
        }


        visitedPages.add(url);


        try {

            console.log("Visiting:", url);


            const response = await fetch(url, {
                headers: {
                    "User-Agent":
                        "Big-A-Search-Crawler/0.1"
                }
            });


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


            // Big-A only indexes HTML pages.
            if (!contentType.includes("text/html")) {
                continue;
            }


            const html =
                await response.text();


            const title =
                getPageTitle(html, url);


            const text =
                getPageText(html);


            // Add the page to Big-A Search.
            searchIndex.push({
                title: title,
                url: url,
                description: text.substring(0, 300)
            });


            pagesCrawled++;


            console.log("Indexed:", title);


            // Find more pages on this domain.
            const links =
                findLinks(html, url, domain);


            for (const link of links) {

                if (!visitedPages.has(link)) {
                    pagesToVisit.push(link);
                }

            }


        } catch (error) {

            console.log(
                "Could not crawl:",
                url
            );

            console.log(error.message);

        }
    }


    console.log(
        "Finished",
        domain,
        "-",
        pagesCrawled,
        "pages indexed."
    );
}


/*
 * Start Big-A Search Crawler.
 */
async function startCrawler() {

    console.log("");
    console.log("Big-A Search Crawler");
    console.log("====================");


    for (const domain of websites) {

        await crawlWebsite(domain);

    }


    // Save Big-A's new search index.
    fs.writeFileSync(
        "data/index.json",
        JSON.stringify(searchIndex, null, 4)
    );


    console.log("");
    console.log("====================");

    console.log(
        "Crawl complete!",
        searchIndex.length,
        "pages are now in Big-A Search."
    );
}


startCrawler();
