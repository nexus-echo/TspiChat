/* global db, printjson */ // mongosh shell globals
// TSPI Digital: role permissions (run once in the mongodb container, then restart the api).
//   mongosh LibreChat /path/to/tspi-day2-roles.mongosh.js
// USER  = clinicians and patients: chat, history, search, bookmarks, files, prompts, memories,
//         skills, scheduled chats, account. No Agent Builder, no MCP Settings.
// ADMIN = everything back (Day 1 config had removed agent / MCP creation from ADMIN too).

const clinician = {
  // Sidebar (Oct 2026): prompts, memories, skills, scheduled chats, bookmarks, files.
  'permissions.PROMPTS.USE': true,
  'permissions.PROMPTS.CREATE': true,
  'permissions.PROMPTS.SHARE': false,
  'permissions.PROMPTS.SHARE_PUBLIC': false,
  'permissions.MEMORIES.USE': true,
  'permissions.MEMORIES.CREATE': true,
  'permissions.MEMORIES.UPDATE': true,
  'permissions.MEMORIES.READ': true,
  'permissions.MEMORIES.OPT_OUT': true,
  'permissions.AGENTS.USE': true, // the locked model spec runs as an ephemeral agent
  'permissions.AGENTS.CREATE': false, // hides the Agent Builder
  'permissions.AGENTS.SHARE': false,
  'permissions.AGENTS.SHARE_PUBLIC': false,
  'permissions.SKILLS.USE': true, // treatment-plan Skill is applied through the model spec
  'permissions.SKILLS.CREATE': true, // the Skills panel needs CREATE
  'permissions.SKILLS.SHARE': false,
  'permissions.SKILLS.SHARE_PUBLIC': false,
  'permissions.SCHEDULES.USE': true,
  'permissions.SCHEDULES.CREATE': true,
  'permissions.BOOKMARKS.USE': true,
  'permissions.MCP_SERVERS.USE': true, // TSPI MCP tools
  'permissions.MCP_SERVERS.CREATE': false, // MCP Settings panel stays admin-only
  'permissions.MCP_SERVERS.SHARE': false,
  'permissions.MCP_SERVERS.SHARE_PUBLIC': false,
  'permissions.MCP_SERVERS.CONFIGURE_OBO': false,
  'permissions.MULTI_CONVO.USE': false,
  'permissions.PEOPLE_PICKER.VIEW_USERS': false,
  'permissions.PEOPLE_PICKER.VIEW_GROUPS': false,
  'permissions.PEOPLE_PICKER.VIEW_ROLES': false,
};

const admin = {
  'permissions.PROMPTS.USE': true,
  'permissions.PROMPTS.CREATE': true,
  'permissions.MEMORIES.USE': true,
  'permissions.MEMORIES.CREATE': true,
  'permissions.MEMORIES.UPDATE': true,
  'permissions.MEMORIES.READ': true,
  'permissions.MEMORIES.OPT_OUT': true,
  'permissions.AGENTS.USE': true,
  'permissions.AGENTS.CREATE': true,
  'permissions.SKILLS.USE': true,
  'permissions.SKILLS.CREATE': true,
  'permissions.SCHEDULES.USE': true,
  'permissions.SCHEDULES.CREATE': true,
  'permissions.BOOKMARKS.USE': true,
  'permissions.MCP_SERVERS.USE': true,
  'permissions.MCP_SERVERS.CREATE': true,
  'permissions.MULTI_CONVO.USE': true,
  'permissions.PEOPLE_PICKER.VIEW_USERS': true,
  'permissions.PEOPLE_PICKER.VIEW_GROUPS': true,
  'permissions.PEOPLE_PICKER.VIEW_ROLES': true,
};

printjson(db.roles.updateMany({ name: 'USER' }, { $set: clinician }));
printjson(db.roles.updateMany({ name: 'ADMIN' }, { $set: admin }));
printjson(
  db.roles
    .find(
      { name: { $in: ['USER', 'ADMIN'] } },
      {
        name: 1,
        'permissions.AGENTS': 1,
        'permissions.MCP_SERVERS': 1,
        'permissions.SKILLS': 1,
        'permissions.PROMPTS': 1,
        'permissions.MEMORIES': 1,
        'permissions.SCHEDULES': 1,
      },
    )
    .toArray(),
);
