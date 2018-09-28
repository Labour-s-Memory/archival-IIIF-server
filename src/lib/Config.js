if (process.env.NODE_ENV !== 'production')
    require('dotenv').load();

module.exports = {
    env: process.env.NODE_ENV,
    logo: process.env.IIIF_SERVER_LOGO,
    attribution: process.env.IIIF_SERVER_ATTRIBUTION,
    universalViewerPath: process.env.IIIF_SERVER_UNIVERSAL_VIEWER_PATH,
    archivalViewerPath: process.env.IIIF_SERVER_ARCHIVAL_VIEWER_PATH,
    imageServerUrl: process.env.IIIF_SERVER_IMAGE_SERVER_URL,
    imageTierSeparator: process.env.IIIF_SERVER_IMAGE_TIER_SEPARATOR,
    metadataOaiUrl: process.env.IIIF_SERVER_METADATA_OAI_URL,

    cacheDisabled: (() => {
        const cacheDiasbled = process.env.IIIF_SERVER_CACHE_DISABLED;
        return (cacheDiasbled && (cacheDiasbled.toLowerCase() === 'true' || cacheDiasbled === '1'));
    })(),

    services: (() => {
        if (!process.env.IIIF_SERVER_SERVICES || (process.env.IIIF_SERVER_SERVICES === 'null'))
            throw new Error("services is not defined");
        return process.env.IIIF_SERVER_SERVICES.split(',');
    })(),

    secret: (() => {
        if (!process.env.IIIF_SERVER_SECRET || (process.env.IIIF_SERVER_SECRET === 'null'))
            throw new Error("secret is not defined");
        return process.env.IIIF_SERVER_SECRET;
    })(),

    accessToken: (() => {
        if (!process.env.IIIF_SERVER_ACCESS_TOKEN || (process.env.IIIF_SERVER_ACCESS_TOKEN === 'null'))
            throw new Error("accessToken is not defined");
        return process.env.IIIF_SERVER_ACCESS_TOKEN;
    })(),

    port: (() => {
        const port = parseInt(process.env.IIIF_SERVER_PORT);
        return (port >= 0) ? port : 3333;
    })(),

    logLevel: (() => {
        return (process.env.IIIF_SERVER_LOG_LEVEL && (process.env.IIIF_SERVER_LOG_LEVEL !== 'null'))
            ? process.env.IIIF_SERVER_LOG_LEVEL : 'debug';
    })(),

    baseUrl: (() => {
        if (!process.env.IIIF_SERVER_BASE_URL || (process.env.IIIF_SERVER_BASE_URL === 'null'))
            throw new Error("base url is not defined");
        return process.env.IIIF_SERVER_BASE_URL;
    })(),

    dataPath: (() => {
        if (!process.env.IIIF_SERVER_DATA_PATH || (process.env.IIIF_SERVER_DATA_PATH === 'null'))
            throw new Error("data path is not defined");
        return process.env.IIIF_SERVER_DATA_PATH;
    })(),

    internalIpAddresses: (() => {
        if (!process.env.IIIF_SERVER_INTERNAL_IP_ADDRESSES || (process.env.IIIF_SERVER_INTERNAL_IP_ADDRESSES === 'null'))
            return [];
        return process.env.IIIF_SERVER_INTERNAL_IP_ADDRESSES.split(',');
    })(),

    loginDisabled: (() => {
        const loginDisabled = process.env.IIIF_SERVER_LOGIN_DISABLED;
        return (loginDisabled && (loginDisabled.toLowerCase() === 'true' || loginDisabled === '1'));
    })(),

    elasticSearchUrl: (() => {
        if (!process.env.IIIF_SERVER_ELASTICSEARCH_URL || (process.env.IIIF_SERVER_ELASTICSEARCH_URL === 'null'))
            throw new Error("elasticsearch url is not defined");
        return process.env.IIIF_SERVER_ELASTICSEARCH_URL;
    })(),

    redis: (() => {
        const redisDisabled = process.env.IIIF_SERVER_REDIS_DISABLED;
        if (redisDisabled && (redisDisabled.toLowerCase() === 'true' || redisDisabled === '1'))
            return null;

        const host = (process.env.IIIF_SERVER_REDIS_HOST && (process.env.IIIF_SERVER_REDIS_HOST !== 'null'))
            ? process.env.IIIF_SERVER_REDIS_HOST : 'localhost';
        const port = parseInt(process.env.IIIF_SERVER_REDIS_PORT) > 0
            ? parseInt(process.env.IIIF_SERVER_REDIS_PORT) : 6379;

        return {host, port};
    })()
};
