import {PDFDocument, PDFPage} from 'pdf-lib';

import config from '../lib/Config';
import logger from '../lib/Logger';
import {ImageItem, RootItem} from '../lib/ItemInterfaces';

import {getImage} from '../image/imageServer';
import {AccessTier} from '@archival-iiif/presentation-builder/dist/v2/Image';

export default async function createPDF(rootItem: RootItem, items: ImageItem[], tier?: AccessTier): Promise<Buffer> {
    const document = await PDFDocument.create();

    document.setTitle(rootItem.label);
    rootItem.authors.length > 0 && document.setAuthor(rootItem.authors[0].name);
    config.attribution && document.setProducer(config.attribution);
    config.attribution && document.setCreator(config.attribution);

    for (const item of items) {
        logger.debug(`Create a PDF page for collection ${item.collection_id} with order ${item.order}; item id ${item.id}`);

        const page = await createPdfPage(document, item, tier);
        if (page)
            document.addPage(page);
    }

    const docBytes = await document.save();

    return Buffer.from(docBytes.buffer);
}

async function createPdfPage(document: PDFDocument, item: ImageItem, tier?: AccessTier): Promise<PDFPage | null> {
    const image = await getImage(item, null, tier ? tier.maxSize : null, {
        region: 'full',
        size: config.pdfImageSize,
        rotation: '0',
        quality: 'default',
        format: 'jpg'
    });

    if (!image.image)
        return null;

    const pdfImage = await document.embedJpg(image.image);

    const page = PDFPage.create(document);
    page.setSize(item.width, item.height);
    page.drawImage(pdfImage, {
        x: 0,
        y: 0,
        width: item.width,
        height: item.height,
    });

    return page;
}
