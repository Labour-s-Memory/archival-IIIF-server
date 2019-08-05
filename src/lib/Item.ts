import * as path from 'path';
import config from './Config';
import {Item, MinimalItem} from './ItemInterfaces';
import getClient, {
    GetRequest, SearchRequest, ScrollRequest, DeleteByQueryRequest, IndexBulkRequest, UpdateBulkRequest,
    GetResponse, SearchResponse
} from './ElasticSearch';

export function createItem(obj: MinimalItem): Item {
    return {
        parent_id: null,
        metadata_id: null,
        type: 'metadata',
        description: null,
        authors: [],
        dates: [],
        physical: null,
        size: null,
        order: null,
        created_at: null,
        width: null,
        height: null,
        resolution: null,
        duration: null,
        metadata: [],
        original: {
            uri: null,
            puid: null
        },
        access: {
            uri: null,
            puid: null
        },
        ...obj
    };
}

export async function indexItems(items: Item[]): Promise<void> {
    try {
        while (items.length > 0) {
            const body = items
                .splice(0, 100)
                .map(item => [
                    {index: {_index: 'items', _id: item.id}},
                    item
                ]);

            await getClient().bulk(<IndexBulkRequest<'items', Item>>{
                refresh: 'wait_for',
                body: [].concat(...body as [])
            });
        }
    }
    catch (e) {
        throw new Error('Failed to index the items!');
    }
}

export async function updateItems(items: MinimalItem[]): Promise<void> {
    try {
        const uniqueItems = items.filter((item, i) =>
            items.findIndex(otherItem => otherItem.id === item.id) === i);

        while (uniqueItems.length > 0) {
            const body = uniqueItems
                .splice(0, 100)
                .map(item => [
                    {update: {_index: 'items', _id: item.id}},
                    {doc: item, upsert: createItem(item)}
                ]);

            await getClient().bulk(<UpdateBulkRequest<'items', MinimalItem, Item>>{
                body: [].concat(...body as [])
            });
        }
    }
    catch (e) {
        throw new Error('Failed to update the items!');
    }
}

export async function deleteItems(collectionId: string): Promise<void> {
    await getClient().deleteByQuery(<DeleteByQueryRequest>{
        index: 'items',
        q: `collection_id:"${collectionId}"`,
        body: {}
    });
}

export async function getItem(id: string): Promise<Item | null> {
    try {
        const response: GetResponse<Item> = await getClient().get(<GetRequest>{index: 'items', id: id});
        return response.body._source;
    }
    catch (err) {
        return null;
    }
}

export async function getChildItems(id: string, sortByOrder = false): Promise<Item[]> {
    const items = await getItems(`parent_id:"${id}"`);
    if (sortByOrder)
        items.sort((cA, cB) => (cA.order !== null && cB.order !== null && cA.order < cB.order) ? -1 : 1);
    return items;
}

export async function getRootItemByCollectionId(id: string): Promise<Item | null> {
    const items = await getItems(`id:"${id}" AND collection_id:"${id}"`);
    return (items.length > 0) ? items[0] : null;
}

export async function getCollectionsByMetadataId(id: string): Promise<string[]> {
    const items = await getItems(`metadata_id:"${id}" AND _exists_:collection_id`);
    return Array.from(new Set(<string[]>items.map(item => item.collection_id)));
}

async function getItems(q: string): Promise<Item[]> {
    const items: Item[] = [];

    try {
        const response: SearchResponse<Item> = await getClient().search(<SearchRequest>{
            index: 'items',
            sort: 'label:asc',
            size: 1000,
            scroll: '10s',
            q
        });

        let {_scroll_id, hits} = response.body;
        while (hits && hits.hits.length) {
            items.push(...hits.hits.map(hit => hit._source));

            if (_scroll_id) {
                const scrollResults: SearchResponse<Item> = await getClient().scroll(<ScrollRequest>{
                    scrollId: _scroll_id,
                    scroll: '10s'
                });

                _scroll_id = scrollResults.body._scroll_id;
                hits = scrollResults.body.hits;
            }
            else {
                hits.hits = [];
            }
        }

        return items;
    }
    catch (err) {
        return items;
    }
}

export function getFullPath(item: Item, type: 'access' | 'original' | null = null): string {
    const relativePath = getRelativePath(item, type);
    return path.join(config.dataRootPath, relativePath);
}

export function getRelativePath(item: Item, type: 'access' | 'original' | null = null): string {
    type = type || getAvailableType(item);

    if (type === 'access')
        return path.join(config.collectionsRelativePath, item.access.uri as string);
    else
        return path.join(config.collectionsRelativePath, item.original.uri as string);
}

export function getPronom(item: Item, type: 'access' | 'original' | null = null): string {
    type = type || getAvailableType(item);

    if (type === 'access')
        return item.access.puid as string;
    else
        return item.original.puid as string;
}

export function getAvailableType(item: Item): 'access' | 'original' {
    return item.access.uri ? 'access' : 'original';
}