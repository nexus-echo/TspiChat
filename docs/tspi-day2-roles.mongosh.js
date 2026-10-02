// TSPI Digital: role permissions (run once in the mongodb container, then restart the api).
//   mongosh LibreChat /path/to/tspi-day2-roles.mongosh.js
// USER  = clinician view: chat, history, search, bookmarks, files, account. Nothing to configure.
// ADMIN = everything back (Day 1 config had removed agent / MCP creation from ADMIN too).

const clinician = {
  'permissions.PROMPTS.USE': false, 'permissions.PROMPTS.CREATE': false,
  'permissions.PROMPTS.SHARE': false, 'permissions.PROMPTS.SHARE_PUBLIC': false,
  'permissions.MEMORIES.USE': false, 'permissions.MEMORIES.CREATE': false,
  'permissions.MEMORIES.UPDATE': false, 'permissions.MEMORIES.READ': false,
  'permissions.MEMORIES.OPT_OUT': false,
  'permissions.AGENTS.USE': true, // the locked model spec runs as an ephemeral agent
  'permissions.AGENTS.CREATE': false, 'permissions.AGENTS.SHARE': false,
  'permissions.AGENTS.SHARE_PUBLIC': false,
  'permissions.SKILLS.USE': true, // treatment-plan Skill is applied through the model spec
  'permissions.SKILLS.CREATE': false, 'permissions.SKILLS.SHARE': false,
  'permissions.SKILLS.SHARE_PUBLIC': false,
  'permissions.MCP_SERVERS.USE': true, // TSPI MCP tools
  'permissions.MCP_SERVERS.CREATE': false, 'permissions.MCP_SERVERS.SHARE': false,
  'permissions.MCP_SERVERS.SHARE_PUBLIC': false, 'permissions.MCP_SERVERS.CONFIGURE_OBO': false,
  'permissions.MULTI_CONVO.USE': false,
  'permissions.PEOPLE_PICKER.VIEW_USERS': false, 'permissions.PEOPLE_PICKER.VIEW_GROUPS': false,
  'permissions.PEOPLE_PICKER.VIEW_ROLES': false,
};

const admin = {
  'permissions.PROMPTS.USE': true, 'permissions.PROMPTS.CREATE': true,
  'permissions.MEMORIES.USE': true, 'permissions.MEMORIES.CREATE': true,
  'permissions.MEMORIES.UPDATE': true, 'permissions.MEMORIES.READ': true,
  'permissions.MEMORIES.OPT_OUT': true,
  'permissions.AGENTS.USE': true, 'permissions.AGENTS.CREATE': true,
  'permissions.SKILLS.USE': true, 'permissions.SKILLS.CREATE': true,
  'permissions.MCP_SERVERS.USE': true, 'permissions.MCP_SERVERS.CREATE': true,
  'permissions.MULTI_CONVO.USE': true,
  'permissions.PEOPLE_PICKER.VIEW_USERS': true, 'permissions.PEOPLE_PICKER.VIEW_GROUPS': true,
  'permissions.PEOPLE_PICKER.VIEW_ROLES': true,
};

printjson(db.roles.updateMany({ name: 'USER' }, { $set: clinician }));
printjson(db.roles.updateMany({ name: 'ADMIN' }, { $set: admin }));
printjson(db.roles.find({ name: { $in: ['USER', 'ADMIN'] } },
  { name: 1, 'permissions.AGENTS': 1, 'permissions.MCP_SERVERS': 1, 'permissions.SKILLS': 1, 'permissions.PROMPTS': 1 }).toArray());
