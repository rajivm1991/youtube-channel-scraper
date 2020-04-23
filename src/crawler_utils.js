const moment = require('moment');
const Apify = require('apify');

const { log, sleep, puppeteer } = Apify.utils;

const utils = require('./utility');
const CONSTS = require('./consts');

exports.handleMaster = async (page, requestQueue, input) => {
    log.debug('waiting for first video to load...');
    const { youtubeVideosXp, urlXp } = CONSTS.SELECTORS.SEARCH;
    await page.waitForXPath(youtubeVideosXp, { visible: true });

    // prepare to infinite scroll manually
    // puppeteer.infiniteScroll(page) is currently buggy
    // see https://github.com/apifytech/apify-js/issues/503
    await utils.moveMouseToCenterScreen(page, CONSTS.MOUSE_STEPS);

    log.info('start infinite scrolling downwards to load all the videos...');
    let queuedVideos = await page.$x(youtubeVideosXp);

    // keep scrolling until no more videos or max limit reached
    if (queuedVideos.length === 0) {
        throw new Error(`No videos on this channel`);
    }

    const maxRequested = (input.maxResults && input.maxResults > 0) ? input.maxResults : 999;
    let userRequestFilled = false;

    let maxInQueue = 0;
    let videoIndex = 0;

    let videosPending = maxInQueue < queuedVideos.length;
    maxInQueue = queuedVideos.length;
    do {
        userRequestFilled = await utils.loadVideosUrls(requestQueue, page, youtubeVideosXp, urlXp, maxRequested, videoIndex, maxInQueue);

        // wait for more videos to *start* loading
        await sleep(CONSTS.DELAY.START_LOADING_MORE_VIDEOS);

        // check how many additional videos have been loaded since
        queuedVideos = await page.$x(youtubeVideosXp);
        videosPending = maxInQueue < queuedVideos.length;

        // update variables
        videoIndex = maxInQueue;
        maxInQueue = queuedVideos.length;
    } while (videosPending && !userRequestFilled);
    log.info('infinite scroll done...');
    log.info(`queuedVideos = ${queuedVideos.length}`);
};

exports.handleDetail = async (page, request) => {
    const { titleXp, viewCountXp, uploadDateXp, likesXp, dislikesXp, channelXp, subscribersXp, descriptionXp } = CONSTS.SELECTORS.VIDEO;

    log.info(`handling detail url ${request.url}`);

    const videoId = utils.getVideoId(request.url);
    log.debug(`got videoId as ${videoId}`);

    log.debug(`searching for title at ${titleXp}`);
    const title = await utils.getDataFromXpath(page, titleXp, 'innerHTML');
    log.debug(`got title as ${title}`);

    log.debug(`searching for viewCount at ${viewCountXp}`);
    const viewCountStr = await utils.getDataFromXpath(page, viewCountXp, 'innerHTML');
    const viewCount = utils.unformatNumbers(viewCountStr);
    log.debug(`got viewCount as ${viewCount}`);

    log.debug(`searching for uploadDate at ${uploadDateXp}`);
    const uploadDateStr = await utils.getDataFromXpath(page, uploadDateXp, 'innerHTML');
    const uploadDate = moment(uploadDateStr, 'MMM DD, YYYY').format();
    log.debug(`got uploadDate as ${uploadDate}`);

    log.debug(`searching for likesCount at ${likesXp}`);
    const likesStr = await utils.getDataFromXpath(page, likesXp, 'innerHTML');
    const likesCount = utils.unformatNumbers(likesStr);
    log.debug(`got likesCount as ${likesCount}`);

    log.debug(`searching for dislikesCount at ${dislikesXp}`);
    const dislikesStr = await utils.getDataFromXpath(page, dislikesXp, 'innerHTML');
    const dislikesCount = utils.unformatNumbers(dislikesStr);
    log.debug(`got dislikesCount as ${dislikesCount}`);

    log.debug(`searching for channel details at ${channelXp}`);
    const channelName = await utils.getDataFromXpath(page, channelXp, 'innerHTML');
    log.debug(`got channelName as ${channelName}`);
    const channelUrl = await utils.getDataFromXpath(page, channelXp, 'href');
    log.debug(`got channelUrl as ${channelUrl}`);

    log.debug(`searching for numberOfSubscribers at ${subscribersXp}`);
    const subscribersStr = await utils.getDataFromXpath(page, subscribersXp, 'innerHTML');
    const numberOfSubscribers = utils.unformatNumbers(subscribersStr.replace(/subscribers/ig, '').trim());
    log.debug(`got numberOfSubscribers as ${numberOfSubscribers}`);

    const description = await utils.getDataFromXpath(page, descriptionXp, 'innerHTML');

    await Apify.pushData({
        title,
        id: videoId,
        url: request.url,
        viewCount,
        date: uploadDate === 'Invalid date' ? uploadDateStr : uploadDate,
        likes: likesCount,
        dislikes: dislikesCount,
        channelName,
        channelUrl,
        numberOfSubscribers,
        details: description
    });
};

exports.hndlPptGoto = async ({ page, request }) => {
    await puppeteer.blockRequests(page);
    return page.goto(request.url, { waitUntil: 'domcontentloaded' });
};

exports.hndlPptLnch = (launchOpts) => {
    launchOpts.apifyProxySession = `sesn_${Math.floor(Math.random() * 100000)}`;
    return Apify.launchPuppeteer(launchOpts);
};

exports.hndlFaildReqs = async ({ request }) => {
    Apify.utils.log.error(`Request ${request.url} failed too many times`);
    await Apify.pushData({
        '#debug': Apify.utils.createRequestDebugInfo(request),
    });
};
