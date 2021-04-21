import { ICoolCache, CoolPlugin, PLUGINSTATUS } from 'midwayjs-cool-core';
import { App, Init, Inject, Provide, Scope, ScopeEnum, Logger } from '@midwayjs/decorator';
import * as IORedis from 'ioredis';
import { ILogger } from '@midwayjs/logger';
import { IMidwayApplication } from '@midwayjs/core';
// @ts-ignore
import * as config from "./package.json";


@Provide()
@Scope(ScopeEnum.Singleton)
export class RedisCacheHandler implements ICoolCache {

    @Inject('cool:coolPlugin')
    coolPlugin: CoolPlugin;

    @App()
    app: IMidwayApplication;

    @Logger()
    coreLogger: ILogger;

    // 缓存对象
    cache;

    private redisConfig;

    @Init()
    async init() {
        try {
            this.cache = null;
            this.redisConfig = await this.coolPlugin.getConfig(config.name.split('-')[2]);
            const getConfig = this.redisConfig.redis ? this.redisConfig.redis : this.redisConfig
            if (typeof getConfig == 'string') {
                this.redisConfig = JSON.parse(getConfig);
            }
            this.createConnect();
        } catch (error) {
            this.cache = null;
        }
        return await this.checkStatus();
    }
    /**
     * 创建连接
     */
    async createConnect() {
        const SocketRedisSymbol = Symbol.for('COOL-CACHE#REDIS');
        if(this.app[SocketRedisSymbol]){
            this.cache = this.app[SocketRedisSymbol];
            return;
        }
        let isFirstConnect = true;
        if (this.redisConfig instanceof Array) {
            this.cache = new IORedis.Cluster(this.redisConfig);
        } else {
            this.cache = new IORedis(this.redisConfig);
        }
        this.app['COOLCACHE'] = this.cache;
        let isError = false;
        this.cache.on('error', (e) => {
            if (isFirstConnect) {
                this.cache = null;
            }
            isFirstConnect = false;
            if (!isError) {
                this.coreLogger.error('\x1B[36m [cool:core] midwayjs cool redis error \x1B[0m');
                this.coreLogger.error(e);
                this.coolPlugin.changeStatus(config.pluginName, PLUGINSTATUS.UNKNOWNERR);
            }
            isError = true;
        })
        this.cache.on('connect', () => {
            this.app['COOLCACHE'] = this.cache;
            this.coolPlugin.changeStatus(config.pluginName, PLUGINSTATUS.USABLE);
            this.coreLogger.info('\x1B[36m [cool:core] midwayjs cool redis connect \x1B[0m');
        })
        this.cache.on('end', () => {
            this.cache = null;
        })
    }

    /**
     * 检查状态
     */
    async checkStatus() {
        if (!this.cache) {
            return PLUGINSTATUS.UNKNOWNERR;
        }
        try {
            if (!this.redisConfig) {
                return PLUGINSTATUS.NOCONF;
            }
            await this.cache.set('core:check:redis', 'yes');
            return PLUGINSTATUS.USABLE;
        } catch (error) {
            return PLUGINSTATUS.UNKNOWNERR
        }
    }

    keys(pattern?: string): Promise<any> {
        return this.cache.keys(pattern);
    }
    getMode(): string {
        return 'redis';
    }
    getMetaCache() {
        return this.cache;
    }
    /**
    * 设置缓存
    * @param key 键
    * @param val 值
    * @param ttl 过期时间(单位：秒)
    */
    async set(key: string, val: any, ttl?: number): Promise<void> {
        if (!this.cache) {
            await this.init();
        }
        await this.cache.set(key, val);
        if (ttl) {
            await this.cache.expire(key, ttl);
        }
    }
    /**
     * 获得缓存
     * @param key 键
     */
    async get(key: string): Promise<any> {
        return await this.cache.get(key);
    }
    /**
     * 删除键
     * @param key 键
     */
    async del(key: string): Promise<void> {
        this.cache.del(key);
    }

}