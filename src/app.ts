import {DefaultState} from 'koa';

import config from './lib/Config.js';
import logger from './lib/Logger.js';

import {extendContext, ExtendedContext} from './lib/Koa.js';
import {servicesRunning, ArgService, StandaloneService, CronService} from './lib/Service.js';

servicesRunning.forEach(function initService(service) {
    switch (service.runAs) {
        case 'web':
            startWeb();
            break;
        case 'worker':
            startWorker(service as ArgService);
            break;
        case 'standalone':
            if (config.appInstance === undefined || parseInt(config.appInstance) === 0)
                startStandalone(service as StandaloneService);
            break;
        case 'cron':
            if (config.appInstance === undefined || parseInt(config.appInstance) === 0)
                startCron(service as CronService);
            break;
    }
});

async function startWeb() {
    const {default: Koa} = await import('koa');
    const {default: json} = await import('koa-json');
    const {default: bodyParser} = await import('koa-bodyparser');
    const {default: compress} = await import('koa-compress');

    const {router: iiifImageRouter} = await import('./image/router.js');
    const {router: iiifPresentationRouter} = await import('./presentation/router.js');
    // TODO: const {router: iiifSearchRouter} = await import('./search/router.js');
    const {router: iiifAuthRouter} = await import('./authentication/router.js');
    const {router: fileRouter} = await import('./file/router.js');
    const {router: pdfRouter} = await import('./pdf/router.js');
    const {router: adminRouter} = await import('./admin/router.js');
    const {router: textRouter} = await import('./text/router.js');
    const {router: staticRouter} = await import('./static/router.js');

    const app = new Koa<DefaultState, ExtendedContext>();

    app.use(async (ctx, next) => {
        ctx.set('Access-Control-Allow-Origin', '*');
        ctx.set('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

        if (ctx.method === 'OPTIONS')
            ctx.status = 204;
        else
            await next();
    });

    app.use(async (ctx, next) => {
        extendContext(ctx);
        await next();
    });

    app.use(async (ctx, next) => {
        try {
            await next();
        }
        catch (err: any) {
            ctx.status = err.status || 500;
            ctx.body = (err.status && err.status < 500) ? err.message : 'Internal Server Error';

            if (!err.status || err.status >= 500)
                ctx.app.emit('error', err, ctx);
        }
    });

    app.on('error', (err, ctx) => {
        if (err.code === 'EPIPE' || err.code === 'ECONNRESET') return;
        logger.error(`${err.status || 500} - ${ctx.method} - ${ctx.originalUrl} - ${err.message}`, {err});
    });

    if (config.env !== 'production') {
        const {default: morgan} = await import('koa-morgan');
        // @ts-ignore
        app.use(morgan('short', {'stream': logger.stream}));
    }

    app.use(compress());
    app.use(json({pretty: false, param: 'pretty'}));
    app.use(bodyParser());

    app.use(iiifImageRouter.routes());
    app.use(iiifPresentationRouter.routes());
    // TODO: app.use(iiifSearchRouter.routes());
    app.use(iiifAuthRouter.routes());

    app.use(fileRouter.routes());
    app.use(pdfRouter.routes());
    app.use(adminRouter.routes());
    app.use(textRouter.routes());
    app.use(staticRouter.routes());

    app.proxy = true;
    app.keys = [config.secret];

    app.listen(config.port);

    logger.info(`Started the web service on ${config.baseUrl} 🚀`);
}

async function startStandalone(service: StandaloneService) {
    const serviceFunc = await service.getService();
    serviceFunc();
    logger.info(`Standalone initialized for ${service.name}`);
}

async function startWorker(service: ArgService) {
    const {onTask} = await import('./lib/Worker.js');
    onTask(service.type, await service.getService());
    logger.info(`Worker initialized for ${service.name}`);
}

async function startCron(service: CronService) {
    const cron = await import('node-cron');
    cron.schedule(service.cron, await service.getService());
    logger.info(`Cron ${service.cron} scheduled for ${service.name}`);
}
