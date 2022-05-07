import axios from 'axios';
import pWhilst from 'p-whilst';
import pMap from 'p-map';
import Conf from 'conf';
import { setTimeout as delay } from 'timers/promises';

const SESSDATA = process.env['SESSDATA'];
const CSRF_TOKEN = process.env['CSRF_TOKEN'];
const HOST_UID = "163044485";

interface DynamicCard {
    desc: {
        dynamic_id_str: string;
        timestamp: number;
    }
}

interface GetDynamicResult {
    code: number;
    data: {
        cards?: DynamicCard[];
        has_more: number;
        next_offset: number;
    }
}

interface RemoveDynamicResult {
    code: number;
}

const conf = new Conf();

const client = axios.create({
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:93.0) Gecko/20100101 Firefox/93.0',
    },
});

function get_dynamic(hostUID: string, offsetID?: string) {
    return client.get<GetDynamicResult>('https://api.vc.bilibili.com/dynamic_svr/v1/dynamic_svr/space_history', {
        params: {
            'host_uid': hostUID,
            'offset_dynamic_id': offsetID ?? '0',
        }
    });
}

function remove_dynamic(id: string) {
    return client.post<RemoveDynamicResult>('https://api.vc.bilibili.com/dynamic_svr/v1/dynamic_svr/rm_dynamic', `dynamic_id=${id}&csrf_token=${CSRF_TOKEN}&csrf=${CSRF_TOKEN}`, {
        headers: {
            'Referer': 'https://t.bilibili.com/',
            'Cookie': `SESSDATA=${SESSDATA}; bili_jct=${CSRF_TOKEN};`
        },
        withCredentials: true,
    });
}

async function GetDynamic(offsetID?: string) {
    const { data } = await get_dynamic(HOST_UID, offsetID);
    let cards = conf.get('get.cards') as DynamicCard[];
    const parsedCards: DynamicCard[] = data.data.cards?.map((card) => ({
        desc: {
            dynamic_id_str: card.desc.dynamic_id_str,
            timestamp: card.desc.timestamp,
        },
    })) ?? [];

    if (cards) {
        console.log(`Loaded ${cards.length} dynamics from local storage.`);
        
        cards.push(...parsedCards)
    } else {
        cards = parsedCards;
    }

    const nextOffset = data.data.next_offset.toString();

    console.log(`NextOffset: ${nextOffset}`);
    console.log(`Get ${cards.length} dynamics.`);
    conf.set({
        get: {
            cards,
            nextOffset,
            lastRun: Date.now(),
            done: data.data.has_more,
        },
    });

    await delay(1000);
}

async function RemoveDynamic(card: DynamicCard | null, index: number) {
    if (!card) {
        return;
    }

    const { data } = await remove_dynamic(card.desc.dynamic_id_str);
    if (!data.code) {
        const time = new Date(card.desc.timestamp * 1000);
        const year = time.getFullYear();
        const month = time.getMonth() + 1;
        const date = time.getDate();
        const hour = time.getHours();
        const minute = time.getMinutes();

        conf.delete(`get.cards.${index}`);
        conf.set('removeCounts', (conf.get('removeCounts', 0) as number) + 1);
        console.log(`Deleted: ${year} ${month}-${date} ${hour}:${minute}, ID: ${card.desc.dynamic_id_str}`);
        
    }

    await delay(1000);
}

async function main() {
    await pWhilst(() => conf.get('get.done') !== 0, () => GetDynamic(conf.get('get.nextOffset') as string | undefined));
    const cards = conf.get('get.cards') as DynamicCard[];

    if (cards.length !== conf.get('removeCounts')) {
        await pMap(cards, RemoveDynamic, { concurrency: 1 });
    }
}

main().catch(console.error);
