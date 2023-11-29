# Crawler Corte IDH

This project is a Node.js application designed for scraping and downloading documents from the [Inter-American Court of Human Rights](https://www.corteidh.or.cr) website. It specifically targets PDF and DOC/DOCX files, organizing them into designated directories for easy access.

## Features

- Web scraping with `puppeteer`.
- Downloads PDF and DOC/DOCX files.
- Automatically creates directories for downloaded files.
- File existence check to avoid redundant downloads.

## Installation

Before running the script, ensure you have Node.js installed on your machine. Then, follow these steps:

1. Clone the repository to your local machine.
2. Navigate to the cloned directory and run `npm install` to install dependencies.

## Usage

The application can be run using the following npm script:

```shell
npm run main
```

This will start the web scraping process, targeting the predefined URLs in the script. Downloaded files will be sorted into pdf and doc directories within a data folder.

## Structure

The main functionality is encapsulated in crawler_corte_idh.js. The script performs the following actions:

Launches a headless browser to navigate to specified URLs.
Scrapes for document links (PDF and DOC/DOCX).
Downloads the documents into respective directories.

## Dependencies

Puppeteer: A Node library for controlling Google Chrome or Chromium.
License

This project is licensed under the ISC License.

## Disclaimer

This tool is intended for educational and research purposes only. Please ensure you have permission to scrape and download content from the target website.
