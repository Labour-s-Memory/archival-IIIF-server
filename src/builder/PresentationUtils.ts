import {existsSync} from 'fs';

import {Text} from '../lib/Text.js';
import config from '../lib/Config.js';
import derivatives from '../lib/Derivative.js';
import {runLib} from '../lib/Task.js';
import getPronomInfo, {PronomInfo} from '../lib/Pronom.js';
import {getFullDerivativePath, getItem} from '../lib/Item.js';
import {IIIFMetadataParams, IIIFMetadata} from '../lib/ServiceTypes.js';
import {getAuthTexts, requiresAuthentication} from '../lib/Security.js';
import {Item, FileItem, ImageItem, RootItem, FolderItem} from '../lib/ItemInterfaces.js';

import {
    Base, Manifest, Collection, AuthService,
    Canvas, Resource, Service, Annotation, AnnotationPage
} from '@archival-iiif/presentation-builder/v3';

import {
    annoPageUri,
    annoUri,
    authUri,
    canvasUri,
    collectionUri,
    derivativeUri,
    fileUri,
    imageResourceUri,
    imageUri,
    manifestUri
} from './UriHelper.js';

export function createMinimalCollection(item: Item, label?: string): Collection {
    return new Collection(collectionUri(item.id), label || item.label);
}

export function createMinimalManifest(item: Item, label?: string): Manifest {
    return new Manifest(manifestUri(item.id), label || item.label);
}

export function createMinimalAnnotationPage(item: Item, text: Text): AnnotationPage {
    return new AnnotationPage(annoPageUri(item.id, text.id));
}

export async function createCollection(item: Item, label?: string): Promise<Collection> {
    const collection = createMinimalCollection(item, label);
    await setBaseDefaults(collection, item);

    return collection;
}

export async function createManifest(item: Item, label?: string): Promise<Manifest> {
    const manifest = createMinimalManifest(item, label);
    await setBaseDefaults(manifest, item);

    return manifest;
}

export function createAnnotationPage(item: Item, text: Text): AnnotationPage {
    const annotationPage = createMinimalAnnotationPage(item, text);
    annotationPage.setContext();

    return annotationPage;
}

export async function createCanvas(item: FileItem, parentItem: Item, setAuth: boolean = false): Promise<Canvas> {
    const canvas = new Canvas(canvasUri(parentItem.id, item.order || 0), item.width, item.height, item.duration);
    const annoPage = new AnnotationPage(annoPageUri(parentItem.id, item.id));
    canvas.setItems(annoPage);

    const resource = await getResource(item, setAuth);
    const annotation = new Annotation(annoUri(parentItem.id, item.id), resource);
    annoPage.setItems(annotation);
    annotation.setCanvas(canvas);

    addDerivatives(annotation, item);

    return canvas;
}

export async function getResource(item: FileItem, setAuth: boolean = false): Promise<Resource> {
    if (item.type === 'image')
        return getImageResource(item as ImageItem, 'full', setAuth);

    const accessPronomData = item.access.puid ? getPronomInfo(item.access.puid) : null;
    const originalPronomData = item.original.puid ? getPronomInfo(item.original.puid) : null;
    const defaultMime = accessPronomData?.mime || originalPronomData?.mime || 'application/octet-stream';

    const resource = Resource.createResource(fileUri(item.id), getType(item.type), defaultMime,
        item.width, item.height, item.duration);
    setAuth && await setAuthServices(resource, item);

    return resource;
}

export async function addThumbnail(base: Base, item: RootItem | FileItem): Promise<void> {
    const resource = await getImageResource(item, '200,');
    base.setThumbnail(resource);
}

export async function addMetadata(base: Base, root: Item): Promise<void> {
    if (root.authors.length > 0) {
        const authors: { [type: string]: string[] } = root.authors.reduce((acc: { [type: string]: string[] }, author) => {
            acc[author.type] ? acc[author.type].push(author.name) : acc[author.type] = [author.name];
            return acc;
        }, {});

        for (const type of Object.keys(authors))
            base.setMetadata(type, authors[type]);
    }

    if (root.dates.length > 0)
        base.setMetadata('Dates', root.dates);

    if (root.physical)
        base.setMetadata('Physical description', String(root.physical));

    if (root.description)
        base.setMetadata('Description', root.description);

    for (const md of root.metadata)
        base.setMetadata(md.label, md.value);

    const md = await runLib<IIIFMetadataParams, IIIFMetadata>('iiif-metadata', {item: root});
    if (md.homepage && md.homepage.length > 0)
        base.setHomepage(md.homepage);

    if (md.metadata && md.metadata.length > 0)
        for (const metadata of md.metadata)
            base.setMetadata(metadata.label, metadata.value);

    if (md.seeAlso && md.seeAlso.length > 0)
        base.setSeeAlso(md.seeAlso);
}

export function getType(type: string): string {
    switch (type) {
        case 'image':
            return 'Image';
        case 'audio':
            return 'Sound';
        case 'video':
            return 'Video';
        case 'pdf':
            return 'Text';
        default:
            return 'Dataset';
    }
}

export async function setAuthServices(base: Base | Service, item: RootItem | FileItem | FolderItem): Promise<void> {
    if (await requiresAuthentication(item)) {
        const authTexts = await getAuthTexts(item);
        for (const type of ['login', 'external'] as ('login' | 'external')[]) {
            const service = AuthService.getAuthenticationService(authUri, authTexts, type);
            if (service)
                base.setService(service);
        }
    }
}

async function setBaseDefaults(base: Base, item: Item): Promise<void> {
    addDefaults(base);

    if (item.description)
        base.setSummary(item.description);

    if (item.parent_id) {
        const parentItem = await getItem(item.parent_id);
        if (parentItem)
            base.setParent(collectionUri(parentItem.id), 'Collection', parentItem.label);
    }
}

async function getImageResource(item: RootItem | FileItem, size = 'max', setAuth: boolean = false): Promise<Resource> {
    const width = (size === 'full' || size === 'max') ? item.width : null;
    const height = (size === 'full' || size === 'max') ? item.height : null;

    const resource = Resource.createResource(
        imageResourceUri(item.id, undefined, {size}),
        'Image', 'image/jpeg', width, height);
    const service = new Service(imageUri(item.id), Service.IMAGE_SERVICE_2, 'http://iiif.io/api/image/2/level2.json');
    resource.setService(service);
    setAuth && await setAuthServices(service, item);

    return resource;
}

function getLogo(size = 'max'): Resource {
    let [width, height] = config.logoDimensions as [number | null, number | null];
    width = (size === 'full' || size === 'max') ? width : null;
    height = (size === 'full' || size === 'max') ? height : null;

    const resource = Resource.createResource(
        imageResourceUri('logo', undefined, {size, format: 'png'}),
        'Image', 'image/png', width, height);
    const service = new Service(imageUri('logo'), Service.IMAGE_SERVICE_2, 'http://iiif.io/api/image/2/level2.json');

    resource.setService(service);

    return resource;
}

function addDefaults(base: Base): void {
    base.setContext();

    if (config.logoRelativePath)
        base.setLogo(getLogo());

    if (config.attribution)
        base.setAttribution(config.attribution);
}

function addDerivatives(annotation: Annotation, item: Item): void {
    const filteredTypes = Object.values(derivatives)
        .filter(info => info.from === item.type && (info.to !== 'image' || info.imageTier))
        .filter(info => info.type === 'waveform'); // TODO: Only waveforms for now

    for (const info of filteredTypes) {
        const path = getFullDerivativePath(item, info);
        if (existsSync(path)) {
            annotation.setSeeAlso({
                id: derivativeUri(item.id, 'waveform'),
                type: getType(info.to),
                format: info.contentType,
                profile: info.profile
            });
        }
    }
}
