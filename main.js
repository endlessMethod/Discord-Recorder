import fs from "fs";
import prism from "prism-media";
import { config } from "dotenv";
import { resolve } from "node:path";
import { Client, GatewayIntentBits } from "discord.js";
import { joinVoiceChannel, getVoiceConnection, EndBehaviorType } from "@discordjs/voice";

const client = new Client({
  intents: [
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

const __dirname = resolve();
config();

//////////////////////////////////////////////////////////////////////

var target = null;

function log(_str) {
  var date = new Date();
  console.log(`[${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}] ` + _str);
}

function record(_guild, _id) {
  let member = _guild.members.cache.get(_id);
  let voiceChannel = member && member.voice.channel;
  let connection = getVoiceConnection(_guild.id);

  if (voiceChannel == null) return;

  if (connection == null || connection.joinConfig.channelId != voiceChannel.id) {
    connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    });
  }

  let out = fs.createWriteStream(`${_id}.rawopus`, { flags: "a" });
  let opus = new prism.opus.Decoder({ frameSize: 1920, channels: 1, rate: 48000 });
  opus.pipe(out);

  let audio = connection.receiver.subscribe(_id, {
    mode: "opus",
    end: {
      behavior: EndBehaviorType.Manual,
    },
  });
  audio.pipe(opus);
}

//////////////////////////////////////////////////////////////////////

client.once("ready", () => {
  log("bot started");

  client.user.setStatus("dnd");
});

client.on("messageCreate", async (_msg) => {
  if (_msg.author.bot) return;
  if (!_msg.content.startsWith(prefix)) return;
  if (process.env.WHITELIST.indexOf(_msg.member.id) == -1) return;

  let args = _msg.content.slice(prefix.length).split(" ");
  let command = args.shift().toLowerCase();

  switch (command) {
    case "record": {
      if (args.length < 1) return;

      let id = args[0];
      let member = _msg.guild.members.cache.get(id);

      if (id == "stop") {
        target = null;
        log(
          `Stop Recording\n` +
            `\tCaller:\n` +
            `\t\tName: ${_msg.member.nickname}\n` +
            `\t\tID: ${_msg.member.id}\n`
        );
        break;
      }

      if (member != undefined) {
        target = id;

        log(
          `Start Recording\n` +
            `\tCaller:\n` +
            `\t\tName: ${_msg.member.nickname}\n` +
            `\t\tID: ${_msg.member.id}\n` +
            `\tTarget:\n` +
            `\t\tName: ${member.nickname}\n` +
            `\t\tID: ${id}\n`
        );

        record(_msg.guild, id);
      }

      break;
    }

    case "leave": {
      let connection = getVoiceConnection(_msg.guild.id);

      if (connection != undefined) {
        connection.destroy();
      }
    }
  }
});

client.on("voiceStateUpdate", (_old, _new) => {
  // if (_old.channel == null) return
  // if (_new.channel == null) return

  if (_new.id != target) return;

  if (_new.channel != undefined) {
    let connection = getVoiceConnection(_old.guild.id);

    if (connection != undefined) {
      connection.destroy();

      joinVoiceChannel({
        channelId: _new.channel.id,
        guildId: _new.guild.id,
        adapterCreator: _new.guild.voiceAdapterCreator,
      });

      log(
        `Move voice channel\n` +
          `\tChannel:\n` +
          `\t\tName: ${_new.channel.name}\n` +
          `\t\tID: ${_new.channel.id}\n`
      );
    }

    record(_new.guild, target);
  } else {
    let connection = getVoiceConnection(_old.guild.id);

    if (connection != undefined) {
      connection.destroy();
    }
  }
});

client.login(process.env.TOKEN);
