// deno-lint-ignore-file no-explicit-any no-case-declarations
import { EventEmitter } from 'eventemitter3'

interface Channel {
	id: string
	name: string
	topic: string
	guildId: string
}

interface Guild {
	id: string
	name: string
	topic: string
	channelIds: string[]
}

export interface User {
	username: string,
	verified: number,
	displayName: string,
	isAdmin: number
}

interface WsPacket {
	type: string
}

interface AvailablePacket extends WsPacket {
	type: 'guildAvailable' | 'channelAvailable'
	payload: {
		uuid: string
	}
}

interface AuthStatusPacket extends WsPacket {
	type: 'authStatus'
	payload: ({
		success: true
		error: string
	} | {
		success: false
	}) & {
		userId: string
		error?: string
	}
}

interface Message {
	messageId: string
	authorId: string
	guildId: string
	channelId: string
	timestamp: number
	content: string
}

interface LoginResponseData {
	token: string,
	userId: string
}

type ApiResponse<t> = {
	error: 0, payload: t, message?: string
} | { error: number, payload: t, message: string }

class CacheManager {
	cache: Record<string, Record<string, any>> = {};
	get(category: string, item: string) {
		if (this.cache[category] == undefined)
			return undefined;
		return this.cache[category][item]
	}
	set<T = any>(category: string, item: string, data: T): T | undefined {
		if (this.cache[category] == undefined)
			return undefined;
		return this.cache[category][item] = data
	}
	has(category: string, item: string) {
		if (this.cache[category] == undefined)
			return undefined;
		return this.cache[category][item] != undefined
	}
	remove(category: string, item: string) {
		if (this.cache[category] == undefined)
			return undefined;
		delete this.cache[category][item]
		return true;
	}
}

/** FEED ME YOUR'E CACHE (intentional spelling mistake, don't @ me) */
class CacheMonster extends CacheManager {
	token: string | null = null;
	apiUrl: string;
	constructor(apiUrl: string) {
		super()
		this.apiUrl = apiUrl;
	}
	/** create or delete, actually */
	createCategory(category: string) {
		this.cache[category] = {}
	}
	async getUser(id: string): Promise<User> {
		if (this.has('users', id))
			return this.get('users', id);
		if (!this.token)
			console.warn('not signed in, expect higher ratelimits')
		const resp = await fetch(`${this.apiUrl}/api/v0/data/user/${id}`, {
			headers: this.token ? {
				authorization: this.token
			} : {}
		})
		if (!resp.ok)
			throw `Response code not OK; response code is ${resp.status}`;
		const json: ApiResponse<User> = await resp.json();
		if (json.error != 0)
			throw `Error while fetching user. Error: ${json.message}`;
		return this.set('users', id, json.payload) as User
	}
	async getChannel(id: string): Promise<Channel> {
		if (this.has('channels', id))
			return this.get('channels', id);
		if (!this.token)
			throw "Can't fetch channels when not signed in";
		const resp = await fetch(`${this.apiUrl}/api/v0/data/channel/${id}`, {
			headers: {
				authorization: this.token
			}
		})
		if (!resp.ok)
			throw `Response code not OK; response code is ${resp.status}`;
		const json: ApiResponse<Channel> = await resp.json();
		if (json.error != 0)
			throw `Error while fetching channel. Error: ${json.message}`;
		return this.set('channels', id, json.payload) as Channel
	}
	async getGuild(id: string): Promise<Guild> {
		if (this.has('guilds', id))
			return this.get('guilds', id);
		if (!this.token)
			throw "Can't fetch guilds when not signed in";
		const resp = await fetch(`${this.apiUrl}/api/v0/data/guild/${id}`, {
			headers: {
				authorization: this.token
			}
		})
		if (!resp.ok)
			throw `Response code not OK; response code is ${resp.status}`;
		const json: ApiResponse<Guild> = await resp.json();
		if (json.error != 0)
			throw `Error while fetching guild. Error: ${json.message}`;
		return this.set('guilds', id, json.payload) as Guild
	}
}

export class CUser {
	username: string
	verified: number
	displayName: string
	isAdmin: number
	constructor(user: User) {
		this.username = user.username
		this.verified = user.verified
		this.displayName = user.displayName
		this.isAdmin = user.isAdmin
	}
}

class SelfUser extends CUser {
	client: Client
	get guilds(): string[] {
		return this.client._guilds
	}
	get channels(): string[] {
		return this.client._channels
	}
	constructor(user: User, client: Client) {
		super(user);
		this.client = client
	}
}

class CGuild {
	_cache: CacheMonster
	id: string
	name: string
	topic: string
	channels: ChannelManager;
	_channels: string[] = [];
	loaded: boolean = false
	// deno-lint-ignore require-await
	async load() {
		// if (!this._cache.token)
		// 	throw 'Cannot fetch channels when not logged in';
		// for (const channel of this._channels) {
		// 	const channelData = await this._cache.getChannel(channel);
		// 	const channelClass = new CChannel(this._cache, channelData, this);
		// 	this.channels.push(channelClass)
		// 	await channelClass.load()
		// }
		this.loaded = true;
	}
	constructor(cache: CacheMonster, guild: Guild) {
		this._cache = cache;
		this.id = guild.id;
		this.name = guild.name;
		this.topic = guild.topic
		this._channels = guild.channelIds;
		this.channels = new ChannelManager(this._cache, this)
	}
}

export class CChannel {
	_cache: CacheMonster
	id: string
	name: string
	topic: string
	_guild: string
	guild?: CGuild
	messages: CMessage[] = [];
	loaded: boolean = false
	async load() {
		if (this.loaded)
			return;
		if (!this._cache.token)
			throw 'Cannot fetch messages when not logged in';
		const resp = await fetch(`${this._cache.apiUrl}/api/v0/data/messages/${this.id}`, {
			headers: {
				authorization: this._cache.token
			}
		});
		if (!resp.ok && resp.headers.get('content-type') != 'application/json')
			throw `Response code not OK; response code is ${resp.status}`;
		const json: ApiResponse<{messages: Message[]}> = await resp.json();
		if (json.error != 0)
			throw `Error while logging in. Error: ${json.message}`;
		this.messages = json.payload.messages.map<CMessage>(m => new CMessage(this._cache, m, this))
		for (const message of this.messages) {
			await message.load()
		}
		this.loaded = true;
	}
	constructor(cache: CacheMonster, channel: Channel, guild: CGuild) {
		this._cache = cache;
		this.id = channel.id;
		this.name = channel.name;
		this.topic = channel.topic;
		this._guild = channel.guildId;
		this.guild = guild;
	}
	async send(content: string) {
		if (!this._cache.token)
			throw 'Cannot send messages when not logged in';
		const resp = await fetch(`${this._cache.apiUrl}/api/v0/message/post`, {
			headers: {
				authorization: this._cache.token,
				'content-type': 'application/json'
			},
			body: JSON.stringify({
				guildId: this._guild,
				channelId: this.id,
				content
			}),
			method: 'POST'
		});
		if (!resp.ok && resp.headers.get('content-type') != 'application/json')
			throw `Response code not OK; response code is ${resp.status}`;
		const json: ApiResponse<Message> = await resp.json();
		if (json.error != 0)
			throw `Error while sending message. Error: ${json.message}`;
		// this.messages
	}
}

export class CMessage {
	id: string
	_author: string
	_guild: string
	_channel: string
	timestamp: Date
	content: string
	private _cache: CacheMonster;
	author?: User
	_guildData?: CGuild
	_channelData?: CChannel
	guild = {
		/** @private @type {CMessage} */
		message: undefined as unknown as CMessage,
		// deno-lint-ignore require-await
		async get(): Promise<CGuild> {
			return this.message._guildData as CGuild
		}
	}
	channel = {
		/** @private @type {CMessage} */
		message: undefined as unknown as CMessage,
		// deno-lint-ignore require-await
		async get(): Promise<CChannel> {
			return this.message._channelData as CChannel
		}
	}
	loaded: boolean = false;
	async load() {
		this.author = new CUser(await this._cache.getUser(this._author))
		this.loaded = true;
	}
	constructor(cache: CacheMonster, message: Message, channel: CChannel) {
		this.id = message.messageId;
		this._cache = cache
		this._author = message.authorId
		this._guild = message.guildId
		this._channel = message.channelId
		this.timestamp = new Date(message.timestamp);
		this.content = message.content
		this._channelData = channel
		this._guildData = channel.guild;
		this.guild.message = this;
		this.channel.message = this;
	}
}

class UnloadedChannelMessage {
	id: string
	_author: string
	_guild: string
	_channel: string
	timestamp: Date
	content: string
	private _cache: CacheMonster;
	author?: User
	guildManager: GuildManager;
	guild = {
		/** @private @type {UnloadedChannelMessage} */
		message: undefined as unknown as UnloadedChannelMessage,
		async get(): Promise<CGuild> {
			return await this.message.guildManager.get(this.message._guild)
		}
	}
	channel = {
		/** @private @type {UnloadedChannelMessage} */
		message: undefined as unknown as UnloadedChannelMessage,
		async get(): Promise<CChannel> {
			const guild = await this.message.guildManager.get(this.message._guild)
			return await guild.channels.get(this.message._channel)
		}
	}
	loaded: boolean = false;
	async load() {
		this.author = new CUser(await this._cache.getUser(this._author))
		this.loaded = true;
	}
	constructor(cache: CacheMonster, message: Message, guildManager: GuildManager) {
		this.id = message.messageId;
		this._cache = cache
		this._author = message.authorId
		this._guild = message.guildId
		this._channel = message.channelId
		this.timestamp = new Date(message.timestamp);
		this.content = message.content
		this.guildManager = guildManager
		this.guild.message = this;
		this.channel.message = this;
	}
}

class ChannelManager {
	channelCache: Record<string, CChannel> = {};
	cache: CacheMonster;
	guild: CGuild
	async get(id: string) {
		if (this.cache.has('channelClasses', id))
			return this.cache.get('channelClasses', id)
		const channel = new CChannel(this.cache, await this.cache.getChannel(id), this.guild);
		this.cache.set('channelClasses', id, channel);
		// await channel.load()
		return channel
	}
	loaded(id: string) {
		return this.cache.has('channelClasses', id)
	}
	constructor(cache: CacheMonster, guild: CGuild) {
		this.cache = cache;
		this.guild = guild;
	}
}

class GuildManager {
	guildCache: Record<string, CGuild> = {};
	cache: CacheMonster;
	async get(id: string) {
		if (this.cache.has('guildClasses', id))
			return this.cache.get('guildClasses', id)
		const guild = new CGuild(this.cache, await this.cache.getGuild(id));
		this.cache.set('guildClasses', id, guild);
		await guild.load()
		return guild
	}
	loaded(id: string) {
		return this.cache.has('guildClasses', id)
	}
	channelLoaded(id: string) {
		const [guildId] = Object.entries(this.guildCache)
			.find(([_, guild]) => guild._channels.includes(id)) ?? [];
		if (!guildId)
			return false;
		return this.guildCache[guildId].channels.loaded(id)
	}
	constructor(cache: CacheMonster) {
		this.cache = cache;
	}
}

export class Client extends EventEmitter {
	// guilds: string[];
	// channels: string[];
	cache: CacheMonster;
	ws?: WebSocket;
	apiUrl: string;
	wsUrl: string;
	private _token: string | null = null;
	_guilds: string[] = [];
	_channels: string[] = [];
	userId: string = '';
	self?: SelfUser
	guilds: GuildManager;
	set token(token: string) {
		this._token = token;
		this.cache.token = token;
	}
	get token(): string | null {
		return this._token
	}
	connect() {
		if (!this.token)
			throw 'cannot connect before logging in';
		this.ws = new WebSocket(this.wsUrl, this.token)
		// deno-lint-ignore no-this-alias
		const client = this;
		this.ws.addEventListener('message', async (e) => {
			console.debug(`INC`, e.data)
			const data: AuthStatusPacket | AvailablePacket | WsPacket = JSON.parse(e.data);
			switch (data.type) {
				case 'authStatus':
					client.userId = (data as AuthStatusPacket).payload.userId
					break;

				case 'guildAvailable':
					client._guilds.push((data as AvailablePacket).payload.uuid)
					break;
				
				case 'channelAvailable':
					client._channels.push((data as AvailablePacket).payload.uuid)
					break;
				
				case 'serverFinished':
					client.self = new SelfUser(await client.cache.getUser(client.userId) as User, client)
					client.emit('ready');
					break;
				
				case 'messageCreate':
					const channelLoaded: boolean =
					client.guilds.loaded((data as unknown as any).payload.guildId) &&
						(await client.guilds.get((data as unknown as any).payload.guildId)).channels
						.loaded((data as unknown as any).payload.channelId);
					const message = channelLoaded ? 
						new CMessage(client.cache,
							(data as unknown as {payload: Message}).payload,
							await (await client.guilds.get((data as unknown as any).payload.guildId)).channels
							.get((data as unknown as any).payload.channelId)) :
						new UnloadedChannelMessage(client.cache, (data as unknown as {payload: Message}).payload, client.guilds);

					await message.load();
					
					client.emit('message', {
						message: message,
						guild: (data as unknown as any).payload.guildId,
						channel: (data as unknown as any).payload.channelId
					})
					if (channelLoaded) {
						const channel = await (await client.guilds
							.get((data as unknown as any).payload.guildId)).channels
							.get((data as unknown as any).payload.channelId);
						channel.messages.unshift(message as CMessage)
					}
					break;
			}
			client.emit(data.type, data)
		})
	}
	constructor(wsurl: string = "wss://api.chat.eqilia.eu/api/v0/live/ws", apiurl: string = "https://api.chat.eqilia.eu") {
		super()
		this.cache = new CacheMonster(apiurl);
		this.cache.createCategory('guilds');
		this.cache.createCategory('channels');
		this.cache.createCategory('users');
		this.guilds = new GuildManager(this.cache);
		this.apiUrl = apiurl
		this.wsUrl = wsurl
	}
	async login(username: string, password: string) {
		if (this.ws && this.ws.readyState == this.ws.OPEN)
			this.ws.close();
		const resp = await fetch(`${this.apiUrl}/api/v0/auth/login`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json'
			},
			body: JSON.stringify({ username, password })
		})
		if (!resp.ok && resp.headers.get('content-type') != 'application/json')
			throw `Response code not OK; response code is ${resp.status}`;
		const json: ApiResponse<LoginResponseData> = await resp.json();
		if (json.error != 0)
			throw `Error while logging in. Error: ${json.message}`;
		this.token = json.payload.token;
		this.connect()
	}
	loginToken(token: string): Promise<void> {
		if (this.ws && this.ws.readyState == this.ws.OPEN)
			this.ws.close();
		this.token = token;
		this.connect()
		return new Promise((resolve, reject) => {
			function handleAuthStatus(data: AuthStatusPacket) {
				if (!data.payload.success)
					return reject(data.payload.error?.toString())
				resolve()
			}
			this.once('authStatus', handleAuthStatus)
			// deno-lint-ignore no-this-alias
			const client = this;
			setTimeout(function () {
				client.off('authStatus', handleAuthStatus);
				reject('authStatus timeout');
			}, 5000)
		})
		// authStatus
	}
}
