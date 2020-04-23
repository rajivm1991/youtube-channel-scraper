const Apify = require('apify');

const utils = require('./utility');
const crawler = require('./crawler_utils');

const { log } = Apify.utils;

Apify.main(async () => {
  const input = await Apify.getInput();
  // const input = {
  //   "channelUrls": [
  //     "https://www.youtube.com/channel/UC1L2JoMpcY6MRLhFd3gg5Xg/videos?view=2&flow=grid&live_view=502",
  //     "https://www.youtube.com/channel/UCuWuAvEnKWez5BUr29VpwqA/videos?view=2&flow=grid&live_view=502"
  //   ],
  //   "maxResults": 5,
  //   "proxyConfiguration": {
  //     "useApifyProxy": false
  //   },
  //   "verboseLog": true
  // };

  const { verboseLog, channelUrls } = input;
  if (verboseLog) {
    log.setLevel(log.LEVELS.DEBUG);
  } else {
    log.setLevel(log.LEVELS.WARNING);
  }

  // proxy settings
  const proxyConfig = { useApifyProxy: true, ...input.proxyConfiguration };

  // launch options - puppeteer
  const pptrLaunchOpts = { ...proxyConfig };
  pptrLaunchOpts.stealth = true;
  pptrLaunchOpts.useChrome = true;

  const requestQueue = await Apify.openRequestQueue();
  const requestListSources = channelUrls.map(url => ({
    url,
    userData: { label: 'MASTER' },
  }));
  const requestList = await Apify.openRequestList('request-list', requestListSources);

  // crawler options - puppeteer
  const pptrCrawlerOpts = {};
  pptrCrawlerOpts.requestList = requestList;
  pptrCrawlerOpts.requestQueue = requestQueue;
  pptrCrawlerOpts.launchPuppeteerOptions = pptrLaunchOpts;

  pptrCrawlerOpts.launchPuppeteerFunction = crawler.hndlPptLnch;
  pptrCrawlerOpts.gotoFunction = crawler.hndlPptGoto;
  pptrCrawlerOpts.handleFailedRequestFunction = crawler.hndlFaildReqs;
  pptrCrawlerOpts.handlePageFunction = async ({ page, request }) => {
    if (utils.isErrorStatusCode(request.statusCode)) {
      throw new Error(`Request error status code: ${request.statusCode} msg: ${request.statusMessage}`);
    }

    switch (request.userData.label) {
      case 'MASTER': {
        await crawler.handleMaster(page, requestQueue, input);
        break;
      }
      case 'DETAIL': {
        await crawler.handleDetail(page, request);
        break;
      }
      default: throw new Error('Unknown request label in handlePageFunction');
    }
  };

  const pptrCrawler = new Apify.PuppeteerCrawler(pptrCrawlerOpts);
  await pptrCrawler.run();
});
