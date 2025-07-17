import { Client, type CMessage } from "./client.ts";

if (!Deno.env.has('USERNAME') ||
	!Deno.env.has('PASSWORD'))
	throw 'creds not in env';

const client = new Client();

await client.login(Deno.env.get('USERNAME') as string, Deno.env.get('PASSWORD') as string);

client.on('ready', async () => {
	console.log("ready")
})

client.on('message', async ({ message }: { message: CMessage, channel: string, guild: string }) => {
	//TODO: fix
	// if (!message.loaded)
	//     await message.load();
	if (message.author?.username == 'fairlight' && message.content.match(/^.+?: /)) {
		console.log('bridge')
		message.content = message.content.replace(/^.+?: /, '')
	}
	console.log(`@${message.author?.username}:`, message.content)
	if (!message.content.startsWith('/'))
		return;
	// deno-lint-ignore no-unused-vars
	const [command, ...args] = message.content.replace('/', '').split(' ');
	const channel = await message.channel.get();
	switch (command) {
		case 'help':
			await channel.send(`shitBOT
 running on domestique.ts - the worst chat domestique library ever
    ANYfuckingWAYS

commands:
  /meow - mrrauwwwwr ^w^
  /echo - put words in my mouth
  /help - this`)
			break;

		case 'meow':
			await channel.send('meow')
			break;

		case 'echo':
			await channel.send(args.join(' '))
			break;

		default:
			await channel.send('idk that command')
			break;
	}
})


