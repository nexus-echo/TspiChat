/**
 * TSPI M12: give conversations made before chat retention was switched on a deletion date.
 *
 * tspi-librechat.yaml sets `interface.retentionMode: all` with `generalChatRetention` (hours), so
 * every new conversation, its messages and files get an `expiredAt` deadline: MongoDB's TTL index
 * deletes conversations and messages, and LibreChat's file sweep deletes files (storage first).
 * Older conversations have no deadline. This script gives them one: created date + the retention
 * period. Anything already past it is deleted by MongoDB within about a minute of the write.
 *
 *   npm run tspi-retention -- [--days=180]          # dry run: counts only
 *   npm run tspi-retention -- [--days=180] --apply  # writes the deadlines
 */
const path = require('path');
const mongoose = require('mongoose');
const { Conversation, Message, File } = require('@librechat/data-schemas').createModels(mongoose);
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const { silentExit } = require('./helpers');
const connect = require('./connect');

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDays(argv) {
  const arg = argv.find((a) => a.startsWith('--days='));
  const days = arg ? Number(arg.slice('--days='.length)) : 180;
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    throw new Error('--days must be a whole number from 1 to 365');
  }
  return days;
}

(async () => {
  try {
    const argv = process.argv.slice(2);
    const days = parseDays(argv);
    const apply = argv.includes('--apply');
    await connect();
    const now = Date.now();
    const convos = await Conversation.find(
      { expiredAt: null },
      'conversationId user createdAt',
    ).lean();
    let past = 0;
    let ops = 0;
    for (const c of convos) {
      const created = new Date(c.createdAt || now).getTime();
      const deadline = new Date(created + days * DAY_MS);
      if (deadline.getTime() <= now) past += 1;
      if (!apply) continue;
      const scope = { user: c.user, conversationId: c.conversationId, expiredAt: null };
      await Conversation.updateOne(
        { _id: c._id, expiredAt: null },
        { $set: { expiredAt: deadline } },
        { timestamps: false },
      );
      await Message.updateMany(scope, { $set: { expiredAt: deadline } }, { timestamps: false });
      await File.updateMany(scope, { $set: { expiredAt: deadline } }, { timestamps: false });
      ops += 1;
    }
    console.log(
      `${convos.length} conversation(s) without a deletion date; ${past} older than ${days} days ` +
        '(deleted soon after --apply).',
    );
    console.log(
      apply ? `Deadlines written for ${ops} conversation(s).` : 'Dry run: nothing written.',
    );
    silentExit(0);
  } catch (err) {
    console.error('Error: ' + err.message);
    silentExit(1);
  }
})();
