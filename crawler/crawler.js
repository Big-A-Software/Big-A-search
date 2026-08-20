/*
 * Big-A Search Crawler
 *
 * Copyright 2024-2026 Big-A
 * Licensed under the Apache License, Version 2.0.
 *
 * This program crawls websites for Big-A Search
 * and creates the search index.
 */

const fs = require("fs");


// Load the websites Big-A should crawl.
const websites = JSON.parse(
    fs.readFileSync("data/sites.json", "utf8")
);


// This will contain the pages Big-A discovers.
const searchIndex = [];


/*
 * Crawl one webpage.
 */
async function crawlPage(url) {

    console.log("Crawling:", url);

    try {

        // Download the webpage.
        const response = await fetch(url);

        if (!response.ok) {
            console.log("Could not crawl:", url);
            return;
        }


        // Read the HTML.
        const html = await response.text();


        // Find the page title.
        const titleMatch =
            html.match(/<title[^>]*>(.*?)<\/title>/is);

        const title =
            titleMatch
                ? titleMatch[1].trim()
                : url;


        // Remove HTML tags to get basic page text.
        const text = html
            .replace(/<script[\s\S]*?<\/script>/gi, " ")
            .replace(/<style[\s\S]*?<\/style>/gi, " ")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim();


        // Add this page to Big-A's index.
        searchIndex.push({
            title: title,
            url: url,
            description: text.substring(0, 300)
        });


        console.log("Indexed:", title);

    } catch (error) {

        console.log("Error crawling:", url);
        console.log(error.message);

    }
}


/*
 * Start the Big-A crawler.
 */
async function startCrawler() {

    console.log("");
    console.log("Big-A Search Crawler");
    console.log("====================");
    console.log("");


    // Crawl every website in sites.json.
    for (const website of websites) {
        await crawlPage(website);
    }


    // Save everything Big-A found.
    fs.writeFileSync(
        "data/index.json",
        JSON.stringify(searchIndex, null, 4)
    );


    console.log("");
    console.log(
        "Finished! Indexed",
        searchIndex.length,
        "pages."
    );

}


startCrawler();
