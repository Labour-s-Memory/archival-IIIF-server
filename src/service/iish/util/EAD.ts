import crypto from 'crypto';
import {Document, Element} from 'libxmljs2';

export interface EADMetadata {
    formats: string[];
    title: string;
    unitId?: string;
    unitIdIsInventoryNumber: boolean;
    order?: number;
    content?: string;
    extent?: string;
    authors?: { type: string, name: string }[];
    dates?: string[];
    eadTitle?: string;
}

const ns = {'ead': 'urn:isbn:1-931666-22-9'};

export const EAD_OAI_PREFIX = 'oai:socialhistoryservices.org:10622/';

export function getRootId(collectionId: string): string {
    return collectionId.split('.')[0];
}

export function getUnitId(collectionId: string): string {
    const collectionIdSplit = collectionId.split('.');
    collectionIdSplit.shift();

    return collectionIdSplit.join('.');
}

export function getMetadata(collectionId: string, ead: Document): EADMetadata[] {
    const archdesc = ead.get<Element>('//ead:ead/ead:archdesc', ns);
    if (archdesc) {
        const unitId = getUnitId(collectionId);
        const metadata = extractMetadataFromLevel(archdesc);

        return [
            metadata,
            ...walkThroughLevels(archdesc.get<Element>(`.//ead:unitid[normalize-space()="${unitId}"]/../..`, ns), metadata)
        ];
    }

    return [];
}

export function getAccess(collectionId: string, ead: Document): string {
    let restriction: string | null = null;
    const accessRestrict = ead
        .get<Element>('//ead:ead/ead:archdesc/ead:descgrp[@type="access_and_use"]/ead:accessrestrict|//ead:ead/ead:archdesc/ead:accessrestrict', ns);
    if (accessRestrict) {
        const accessValue = accessRestrict.get<Element>('./ead:p', ns);
        if (accessValue)
            restriction = accessValue.text().toLowerCase().trim();

        const unitId = getUnitId(collectionId);
        const accessType = accessRestrict.attr('type');
        if (accessType && (accessType.value() === 'part')) {
            const itemAccessRestrict = ead
                .get<Element>(`//ead:ead/ead:archdesc//ead:unitid[normalize-space()="${unitId}"]/../../ead:accessrestrict`, ns);

            if (itemAccessRestrict) {
                const itemAccessRestrictAttr = itemAccessRestrict.attr('type');
                restriction = itemAccessRestrictAttr ? itemAccessRestrictAttr.value() : 'open';
            }
            else
                restriction = 'open';
        }
    }

    switch (restriction) {
        case 'gesloten':
        case 'closed':
            return 'closed';
        case 'beperkt':
        case 'restricted':
            return 'restricted';
        case 'date':
            return 'date';
        default:
            return 'open';
    }
}

function walkThroughLevels(level: Element | null, parentMetadata: EADMetadata): EADMetadata[] {
    if (!level)
        return [];

    const metadata = extractMetadataFromLevel(level, parentMetadata);
    const parent = level.get<Element>('.//preceding-sibling::ead:did/..', ns);
    if (parent && parent.name() !== level.name())
        return [...walkThroughLevels(parent, metadata), metadata];

    return [metadata];
}

function extractMetadataFromLevel(level: Element | null, parentMetadata: EADMetadata | null = null): EADMetadata {
    const metadata: EADMetadata = {formats: [], title: 'No title', unitIdIsInventoryNumber: true};
    if (!level)
        return metadata;

    extractFormats(level, metadata, parentMetadata);
    extractTitle(level, metadata);
    extractUnitId(level, metadata, parentMetadata);
    extractOrder(level, metadata);
    extractContent(level, metadata);
    extractExtent(level, metadata);
    extractAuthors(level, metadata);
    extractDates(level, metadata);
    extractEadTitle(metadata, parentMetadata);

    return metadata;
}

function extractFormats(ead: Element, metadata: EADMetadata, parentMetadata: EADMetadata | null): void {
    const formatElems = ead.find<Element>('./ead:descgrp[@type="content_and_structure"]/' +
        'ead:controlaccess/ead:controlaccess/ead:genreform|ead:controlaccess/ead:genreform', ns);

    const formats = formatElems.map(formatElem => {
        const format = formatElem.text().toLowerCase();

        if (format.includes('article'))
            return 'article';

        if (format.includes('serial'))
            return 'serial';

        if (format.includes('book'))
            return 'book';

        if (format.includes('sound'))
            return 'sound';

        if (format.includes('visual') || format.includes('photo') || format.includes('poster')
            || format.includes('drawing') || format.includes('object'))
            return 'visual';

        if (format.includes('moving'))
            return 'moving visual';

        return 'archive';
    });

    if (formats.length === 0 && parentMetadata)
        metadata.formats = parentMetadata.formats;
    else
        metadata.formats = [...new Set(formats)];
}

function extractTitle(ead: Element, metadata: EADMetadata): void {
    const title = ead.get<Element>('./ead:did/ead:unittitle', ns);
    if (title)
        metadata.title = title.text().trim();
}

function extractUnitId(ead: Element, metadata: EADMetadata, parentMetadata: EADMetadata | null): void {
    if (metadata.title) {
        const unitId = ead.get<Element>('./ead:did/ead:unitid', ns);
        metadata.unitIdIsInventoryNumber = !!unitId && parentMetadata !== null;
        metadata.unitId = unitId
            ? unitId.text().trim()
            : crypto.createHash('md5').update(metadata.title).digest('hex');
    }
}

function extractOrder(ead: Element, metadata: EADMetadata): void {
    metadata.order = ead.get('count(./preceding-sibling::*)', ns) as unknown as number;
}

function extractContent(ead: Element, metadata: EADMetadata): void {
    const content = ead.find<Element>('./ead:descgrp[@type="content_and_structure"]/ead:scopecontent/ead:p|./ead:scopecontent/ead:p', ns);

    if (content.length > 0)
        metadata.content = content
            .reduce<string[]>((acc, p) => [...acc, p.text().trim()], [])
            .join('<br/>');
}

function extractExtent(ead: Element, metadata: EADMetadata): void {
    const extent = ead.get<Element>('./ead:did/ead:physdesc//ead:extent', ns);
    if (extent)
        metadata.extent = extent.text().trim();
}

function extractAuthors(ead: Element, metadata: EADMetadata): void {
    const origination = ead.find<Element>('./ead:did//ead:origination', ns).map(origin => {
        const type = origin.attr('label');
        return {type: type ? type.value() : 'Author', name: origin.text().trim()};
    });

    if (origination.length > 0)
        metadata.authors = origination;
}

function extractDates(ead: Element, metadata: EADMetadata): void {
    const dates = ead.find<Element>('./ead:did//ead:unitdate', ns).map(date => date.text().trim());
    if (dates.length > 0)
        metadata.dates = dates;
}

function extractEadTitle(metadata: EADMetadata, parentMetadata: EADMetadata | null): void {
    if (parentMetadata)
        metadata.eadTitle = parentMetadata.eadTitle || parentMetadata.title;
}
