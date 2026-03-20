import express from 'express';
import { PassThrough } from 'stream';
import { createServer as createViteServer } from 'vite';
import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits, WebhookClient, ActionRowBuilder, ButtonBuilder, ButtonStyle, Events, EmbedBuilder } from 'discord.js';
import { joinVoiceChannel, createAudioPlayer, createAudioResource, StreamType, AudioPlayerStatus, VoiceConnectionStatus, VoiceConnection } from '@discordjs/voice';
import ytdl from '@distube/ytdl-core';
import ytSearch from 'yt-search';
// @ts-ignore
import spotifyUrlInfo from 'spotify-url-info';
import play from 'play-dl';
import cors from 'cors';
import path from 'path';

// @ts-ignore
const spotify = spotifyUrlInfo(fetch);

const app = express();
app.use(express.json());
app.use(cors());

const PORT = 3000;
const WEBHOOK_URL = 'https://discord.com/api/webhooks/1484326186787012649/VDX9Yd11B0uyzoYg7CZH4vaMwp6lzJedoKpsjrN4UcoA_yj87lyWUCVLIt9TCngSCoRT';
const OWNER_ID = '1460935271389593668';

let botClient: Client | null = null;
let isHosting = false;
const startTime = Date.now();

interface QueueItem {
  title: string;
  url: string;
}

interface GuildQueue {
  items: QueueItem[];
  loop: boolean;
  player: any;
  connection: VoiceConnection | null;
  playing: boolean;
  vcJoinTime: number | null;
}

const queues = new Map<string, GuildQueue>();

function getQueue(guildId: string): GuildQueue {
  if (!queues.has(guildId)) {
    const player = createAudioPlayer();
    player.on(AudioPlayerStatus.Idle, () => {
      const q = queues.get(guildId);
      if (q) {
        if (q.items.length > 0) {
          if (q.loop) {
            // Move current to end
            const current = q.items.shift();
            if (current) q.items.push(current);
          } else {
            q.items.shift();
          }
        }
        playNext(guildId);
      }
    });
    player.on('error', error => {
      console.error('Error in audio player:', error);
      const q = queues.get(guildId);
      if (q) {
        q.items.shift();
        playNext(guildId);
      }
    });
    queues.set(guildId, {
      items: [],
      loop: false,
      player,
      connection: null,
      playing: false,
      vcJoinTime: null
    });
  }
  return queues.get(guildId)!;
}

async function playNext(guildId: string) {
  const queue = getQueue(guildId);
  if (queue.items.length === 0) {
    queue.playing = false;
    return;
  }

  const item = queue.items[0];
  try {
    const stream = await play.stream(item.url);
    const bufferStream = new PassThrough({ highWaterMark: 1024 * 1024 * 10 });
    stream.stream.pipe(bufferStream);
    
    const resource = createAudioResource(bufferStream, { 
      inputType: stream.type,
      inlineVolume: true
    });
    resource.volume?.setVolume(0.6);

    queue.player.play(resource);
    queue.playing = true;
  } catch (error) {
    console.error('Error playing next:', error);
    queue.items.shift();
    playNext(guildId);
  }
}

const commands = [
  new SlashCommandBuilder()
    .setName('pbp')
    .setDescription('Sends a message and deletes yours (Owner Only)')
    .addStringOption(option => option.setName('message').setDescription('The message to send').setRequired(true)),
  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Bans a user')
    .addUserOption(option => option.setName('target').setDescription('The user to ban').setRequired(true))
    .addStringOption(option => option.setName('period').setDescription('Ban period').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kicks a user')
    .addUserOption(option => option.setName('target').setDescription('The user to kick').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
  new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Mutes a user')
    .addUserOption(option => option.setName('target').setDescription('The user to mute').setRequired(true))
    .addStringOption(option => option.setName('period').setDescription('Mute period').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder()
    .setName('application')
    .setDescription('Submit an application')
    .addStringOption(option => option.setName('content').setDescription('Your application content').setRequired(true)),
  new SlashCommandBuilder()
    .setName('connect-vc')
    .setDescription('Connects the bot to your voice channel'),
  new SlashCommandBuilder()
    .setName('play')
    .setDescription('Plays audio from Spotify/YouTube/SoundCloud (Owner Only)')
    .addStringOption(option => option.setName('audio').setDescription('The audio to play').setRequired(true)),
  new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stops playing and leaves VC (Owner Only)'),
  new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Shows the current audio queue'),
  new SlashCommandBuilder()
    .setName('247')
    .setDescription('Toggles 24/7 mode (repeats the queue forever) (Owner Only)'),
  new SlashCommandBuilder()
    .setName('uptime')
    .setDescription('Shows the bot uptime'),
  new SlashCommandBuilder()
    .setName('vc-time')
    .setDescription('Shows how long the bot has been in the current VC'),
  new SlashCommandBuilder()
    .setName('pump')
    .setDescription('Makes the bot freak out and spam 100 messages'),
  new SlashCommandBuilder()
    .setName('host')
    .setDescription('Host command'),
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Shows all commands and what they do'),
];

async function startBot(token: string) {
  if (botClient) return;
  
  try {
    const clientID = await play.getFreeClientID();
    await play.setToken({ soundcloud: { client_id: clientID } });
  } catch (e) {
    console.error('Failed to set SoundCloud client ID:', e);
  }

  botClient = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.GuildVoiceStates,
    ]
  });

  botClient.once(Events.ClientReady, async (readyClient) => {
    console.log(`Ready! Logged in as ${readyClient.user.tag}`);
    const rest = new REST().setToken(token);
    try {
      console.log('Started refreshing application (/) commands.');
      await rest.put(
        Routes.applicationCommands(readyClient.user.id),
        { body: commands },
      );
      console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
      console.error(error);
    }
  });

  botClient.on(Events.InteractionCreate, async interaction => {
    if (interaction.isChatInputCommand()) {
      const { commandName } = interaction;

      if (commandName === 'pbp') {
        if (interaction.user.id !== OWNER_ID) {
          return interaction.reply({ content: 'This command is owner only.', ephemeral: true });
        }
        const message = interaction.options.getString('message');
        await interaction.reply({ content: 'Sending...', ephemeral: true });
        if (interaction.channel) {
          await interaction.channel.send(message || '');
        }
      } else if (commandName === 'ban') {
        const target = interaction.options.getUser('target');
        const period = interaction.options.getString('period');
        if (!interaction.guild) return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
        
        const member = await interaction.guild.members.fetch(target!.id).catch(() => null);
        const botMember = await interaction.guild.members.fetch(botClient!.user!.id);
        
        if (!member) {
          return interaction.reply({ content: 'User not found in this server.', ephemeral: true });
        }
        
        if (!botMember.permissions.has(PermissionFlagsBits.BanMembers)) {
          return interaction.reply({ content: 'I do not have permission to ban members.', ephemeral: true });
        }
        
        if (member.roles.highest.position >= botMember.roles.highest.position) {
          return interaction.reply({ content: 'I cannot ban this user because their role is higher than or equal to mine.', ephemeral: true });
        }

        try {
          await member.ban({ reason: `Banned by ${interaction.user.tag}. Period: ${period || 'Permanent'}` });
          await interaction.reply({ content: `Banned ${target!.tag}.` });
        } catch (e) {
          console.error('Ban error:', e);
          await interaction.reply({ content: 'Failed to ban user due to an unknown error.', ephemeral: true });
        }
      } else if (commandName === 'kick') {
        const target = interaction.options.getUser('target');
        if (!interaction.guild) return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
        
        const member = await interaction.guild.members.fetch(target!.id).catch(() => null);
        const botMember = await interaction.guild.members.fetch(botClient!.user!.id);
        
        if (!member) {
          return interaction.reply({ content: 'User not found in this server.', ephemeral: true });
        }
        
        if (!botMember.permissions.has(PermissionFlagsBits.KickMembers)) {
          return interaction.reply({ content: 'I do not have permission to kick members.', ephemeral: true });
        }
        
        if (member.roles.highest.position >= botMember.roles.highest.position) {
          return interaction.reply({ content: 'I cannot kick this user because their role is higher than or equal to mine.', ephemeral: true });
        }

        try {
          await member.kick(`Kicked by ${interaction.user.tag}`);
          await interaction.reply({ content: `Kicked ${target!.tag}.` });
        } catch (e) {
          console.error('Kick error:', e);
          await interaction.reply({ content: 'Failed to kick user due to an unknown error.', ephemeral: true });
        }
      } else if (commandName === 'mute') {
        const target = interaction.options.getUser('target');
        const period = interaction.options.getString('period');
        if (!interaction.guild) return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
        
        const member = await interaction.guild.members.fetch(target!.id).catch(() => null);
        const botMember = await interaction.guild.members.fetch(botClient!.user!.id);
        
        if (!member) {
          return interaction.reply({ content: 'User not found in this server.', ephemeral: true });
        }
        
        if (!botMember.permissions.has(PermissionFlagsBits.ModerateMembers)) {
          return interaction.reply({ content: 'I do not have permission to mute members.', ephemeral: true });
        }
        
        if (member.roles.highest.position >= botMember.roles.highest.position) {
          return interaction.reply({ content: 'I cannot mute this user because their role is higher than or equal to mine.', ephemeral: true });
        }
        
        if (member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ content: 'I cannot mute an administrator.', ephemeral: true });
        }

        // Parse period (e.g. "10m", "1h", "1d")
        let durationMs = 60 * 60 * 1000; // Default 1 hour
        if (period) {
          if (period.toLowerCase() === '0' || period.toLowerCase() === 'remove' || period.toLowerCase() === 'unmute') {
            durationMs = 0;
          } else {
            const match = period.match(/^(\d+)([smhd])$/i);
            if (match) {
              const val = parseInt(match[1]);
              const unit = match[2].toLowerCase();
              if (unit === 's') durationMs = val * 1000;
              else if (unit === 'm') durationMs = val * 60 * 1000;
              else if (unit === 'h') durationMs = val * 60 * 60 * 1000;
              else if (unit === 'd') durationMs = val * 24 * 60 * 60 * 1000;
            }
          }
        }
        
        // Discord limit is 28 days
        if (durationMs > 28 * 24 * 60 * 60 * 1000) {
          return interaction.reply({ content: 'Mute period cannot exceed 28 days.', ephemeral: true });
        }

        try {
          if (durationMs === 0) {
            await member.timeout(null, `Unmuted by ${interaction.user.tag}`);
            await interaction.reply({ content: `Unmuted ${target!.tag}.` });
          } else {
            await member.timeout(durationMs, `Muted by ${interaction.user.tag}. Period: ${period || '1 hour'}`);
            await interaction.reply({ content: `Muted ${target!.tag} for ${period || '1 hour'}.` });
          }
        } catch (e) {
          console.error('Mute error:', e);
          await interaction.reply({ content: 'Failed to mute user. They might have a higher role or I lack permissions.', ephemeral: true });
        }
      } else if (commandName === 'application') {
        const content = interaction.options.getString('content');
        const webhookClient = new WebhookClient({ url: WEBHOOK_URL });
        
        const row = new ActionRowBuilder<ButtonBuilder>()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`accept_app_${interaction.user.id}`)
              .setLabel('Accept')
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId(`decline_app_${interaction.user.id}`)
              .setLabel('Decline')
              .setStyle(ButtonStyle.Danger),
          );

        const embed = new EmbedBuilder()
          .setTitle('New Application')
          .setDescription(`**From:** ${interaction.user.tag} (${interaction.user.id})\n\n**Content:**\n${content}`)
          .setColor(0x0099FF);

        try {
          // Send to webhook for logging (without buttons, as webhooks don't route buttons to the bot unless the bot created the webhook)
          await webhookClient.send({ embeds: [embed] });
        } catch (e) {
          console.error('Failed to send to webhook:', e);
        }

        try {
          // DM the owner with the buttons so they can actually click them
          const owner = await botClient!.users.fetch(OWNER_ID);
          await owner.send({
            content: 'You have a new application to review:',
            embeds: [embed],
            components: [row]
          });
          await interaction.reply({ content: 'Your application has been submitted to the owner.', ephemeral: true });
        } catch (e) {
          console.error('Failed to DM owner:', e);
          await interaction.reply({ content: 'Failed to send application to the owner. They might have DMs disabled.', ephemeral: true });
        }
      } else if (commandName === 'connect-vc') {
        if (!interaction.guild) return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
        const member = await interaction.guild.members.fetch(interaction.user.id);
        const voiceChannel = member.voice.channel;
        if (!voiceChannel) {
          return interaction.reply({ content: 'You need to be in a voice channel to use this command.', ephemeral: true });
        }
        joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: interaction.guild.id,
          adapterCreator: interaction.guild.voiceAdapterCreator as any,
        });
        await interaction.reply({ content: `Connected to ${voiceChannel.name}.` });
      } else if (commandName === 'play') {
        if (interaction.user.id !== OWNER_ID) {
          return interaction.reply({ content: 'This command is owner only.', ephemeral: true });
        }
        const audio = interaction.options.getString('audio');
        if (!interaction.guild) return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
        const member = await interaction.guild.members.fetch(interaction.user.id);
        const voiceChannel = member.voice.channel;
        if (!voiceChannel) {
          return interaction.reply({ content: 'You need to be in a voice channel to use this command.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
          let query = audio!;
          let title = audio!;

          if (audio!.includes('spotify.com')) {
            try {
              const { getPreview } = spotify;
              const data = await getPreview(audio!);
              query = `${data.title} ${data.artist}`;
              title = query;
            } catch (e) {
              console.error('Spotify error:', e);
              return interaction.editReply({ content: 'Failed to fetch Spotify track.' });
            }
          } else if (audio!.includes('youtube.com') || audio!.includes('youtu.be')) {
            try {
              // Extract title from YouTube using yt-search to avoid IP blocks
              const searchResult = await ytSearch(audio!);
              if (searchResult && searchResult.videos.length) {
                query = searchResult.videos[0].title;
                title = query;
              }
            } catch (e) {
              // Ignore and just use the URL as query
            }
          }

          // Search SoundCloud with the extracted query
          const scInfo = await play.search(query, { limit: 1, source: { soundcloud: 'tracks' } });
          if (!scInfo || scInfo.length === 0) {
            return interaction.editReply({ content: `Could not find a match for **${title}** on SoundCloud.` });
          }

          const trackTitle = scInfo[0].name || (scInfo[0] as any).title;
          const trackUrl = scInfo[0].url;

          const queue = getQueue(interaction.guild.id);
          queue.items.push({ title: trackTitle, url: trackUrl });

          if (!queue.connection) {
            queue.connection = joinVoiceChannel({
              channelId: voiceChannel.id,
              guildId: interaction.guild.id,
              adapterCreator: interaction.guild.voiceAdapterCreator as any,
              selfDeaf: true,
            });
            queue.connection.subscribe(queue.player);
            queue.vcJoinTime = Date.now();
            
            queue.connection.on(VoiceConnectionStatus.Disconnected, () => {
              queue.connection?.destroy();
              queue.connection = null;
              queue.playing = false;
              queue.items = [];
              queue.vcJoinTime = null;
            });
          }

          if (!queue.playing) {
            await interaction.editReply({ content: `Added to queue and playing: **${trackTitle}**` });
            playNext(interaction.guild.id);
          } else {
            await interaction.editReply({ content: `Added to queue: **${trackTitle}**` });
          }
        } catch (error) {
          console.error('Error playing audio:', error);
          await interaction.editReply({ content: 'An error occurred while trying to play the audio. The streaming service might be blocking the connection.' });
        }
      } else if (commandName === 'stop') {
        if (interaction.user.id !== OWNER_ID) {
          return interaction.reply({ content: 'This command is owner only.', ephemeral: true });
        }
        if (!interaction.guild) return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
        
        const queue = getQueue(interaction.guild.id);
        queue.items = [];
        queue.playing = false;
        queue.player.stop();
        if (queue.connection) {
          queue.connection.destroy();
          queue.connection = null;
        }
        queue.vcJoinTime = null;
        await interaction.reply({ content: 'Stopped playing and left the voice channel.' });
      } else if (commandName === 'queue') {
        if (!interaction.guild) return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
        const queue = getQueue(interaction.guild.id);
        if (queue.items.length === 0) {
          return interaction.reply({ content: 'The queue is currently empty.' });
        }
        
        let queueText = `**Current Queue:**\n`;
        queue.items.slice(0, 10).forEach((item, index) => {
          queueText += `${index + 1}. **${item.title}**${index === 0 ? ' (Currently Playing)' : ''}\n`;
        });
        if (queue.items.length > 10) {
          queueText += `\n*...and ${queue.items.length - 10} more*`;
        }
        queueText += `\n\n**24/7 Mode:** ${queue.loop ? 'Enabled' : 'Disabled'}`;
        await interaction.reply({ content: queueText });
      } else if (commandName === '247') {
        if (interaction.user.id !== OWNER_ID) {
          return interaction.reply({ content: 'This command is owner only.', ephemeral: true });
        }
        if (!interaction.guild) return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
        
        const queue = getQueue(interaction.guild.id);
        queue.loop = !queue.loop;
        await interaction.reply({ content: `24/7 mode is now **${queue.loop ? 'Enabled' : 'Disabled'}**.` });
      } else if (commandName === 'uptime') {
        const uptimeMs = Date.now() - startTime;
        const days = Math.floor(uptimeMs / (24 * 60 * 60 * 1000));
        const hours = Math.floor((uptimeMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
        const minutes = Math.floor((uptimeMs % (60 * 60 * 1000)) / (60 * 1000));
        const seconds = Math.floor((uptimeMs % (60 * 1000)) / 1000);
        
        await interaction.reply({ content: `**Bot Uptime:** ${days}d ${hours}h ${minutes}m ${seconds}s` });
      } else if (commandName === 'vc-time') {
        if (!interaction.guild) return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
        const queue = getQueue(interaction.guild.id);
        if (!queue.vcJoinTime) {
          return interaction.reply({ content: 'The bot is not currently in a voice channel.' });
        }
        
        const vcTimeMs = Date.now() - queue.vcJoinTime;
        const hours = Math.floor(vcTimeMs / (60 * 60 * 1000));
        const minutes = Math.floor((vcTimeMs % (60 * 60 * 1000)) / (60 * 1000));
        const seconds = Math.floor((vcTimeMs % (60 * 1000)) / 1000);
        
        await interaction.reply({ content: `**Time in VC:** ${hours}h ${minutes}m ${seconds}s` });
      } else if (commandName === 'pump') {
        await interaction.reply({ content: 'Pumping...', ephemeral: true });
        if (interaction.channel) {
          for (let i = 0; i < 100; i++) {
            const msg = await interaction.channel.send('yo bro hehehhe');
            setTimeout(() => msg.delete().catch(() => {}), 1000);
          }
        }
      } else if (commandName === 'host') {
        await interaction.reply({ content: "that's not available yet, directly message the owner for it", ephemeral: true });
      } else if (commandName === 'help') {
        const helpText = `**Commands:**
\`/pbp <message>\` - Sends a message and deletes yours (Owner only)
\`/ban <user> [period]\` - Bans a user
\`/kick <user>\` - Kicks a user
\`/mute <user> [period]\` - Mutes a user
\`/application <content>\` - Submit an application to the owner
\`/connect-vc\` - Connects the bot to your voice channel
\`/play <audio>\` - Plays audio from Spotify/YouTube/SoundCloud (Owner only)
\`/stop\` - Stops playing and leaves VC (Owner only)
\`/queue\` - Shows the current audio queue
\`/247\` - Toggles 24/7 mode (repeats the queue forever) (Owner only)
\`/uptime\` - Shows the bot uptime
\`/vc-time\` - Shows how long the bot has been in the current VC
\`/pump\` - Spams 100 messages and deletes them
\`/host\` - Secret message
\`/help\` - Shows this help message`;
        await interaction.reply({ content: helpText, ephemeral: true });
      }
    } else if (interaction.isButton()) {
      if (interaction.user.id !== OWNER_ID) {
        return interaction.reply({ content: 'Only the owner can use these buttons.', ephemeral: true });
      }
      const customId = interaction.customId;
      if (customId.startsWith('accept_app_') || customId.startsWith('decline_app_')) {
        const isAccept = customId.startsWith('accept_app_');
        const userId = customId.replace(isAccept ? 'accept_app_' : 'decline_app_', '');
        
        try {
          const user = await botClient!.users.fetch(userId);
          if (isAccept) {
            await user.send('Congratulations! Your application has been approved.');
          } else {
            await user.send('We regret to inform you that your application has been declined.');
          }
          await interaction.reply({ content: `Application ${isAccept ? 'approved' : 'declined'} for <@${userId}>.`, ephemeral: true });
          // Remove the buttons from the original message so they can't be clicked again
          await interaction.message.edit({ components: [] }).catch(() => {});
        } catch (e) {
          await interaction.reply({ content: `Failed to DM user <@${userId}>. They might have DMs disabled.`, ephemeral: true });
          await interaction.message.edit({ components: [] }).catch(() => {});
        }
      }
    }
  });

  try {
    await botClient.login(token);
    isHosting = true;
  } catch (error) {
    console.error('Failed to login:', error);
    botClient.destroy();
    botClient = null;
    isHosting = false;
    throw error;
  }
}

function stopBot() {
  if (botClient) {
    botClient.destroy();
    botClient = null;
    isHosting = false;
  }
}

app.post('/api/bot/start', async (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ success: false, message: 'Bot token is required.' });
  }
  if (isHosting) {
    return res.json({ success: false, message: 'Bot is already running.' });
  }
  try {
    await startBot(token);
    res.json({ success: true, message: 'Bot started successfully.' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/bot/stop', (req, res) => {
  if (!isHosting) {
    return res.json({ success: false, message: 'Bot is not running.' });
  }
  stopBot();
  res.json({ success: true, message: 'Bot stopped successfully.' });
});

app.get('/api/bot/status', (req, res) => {
  res.json({ isHosting });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
