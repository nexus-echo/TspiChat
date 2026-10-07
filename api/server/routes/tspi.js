const express = require('express');
const { logger, getTenantId } = require('@librechat/data-schemas');
const { CacheKeys, Permissions, PermissionTypes } = require('librechat-data-provider');
const {
  TspiReportError,
  generateCheckAccess,
  createTspiReportPdf,
  createAuthIdentityContext,
} = require('@librechat/api');
const { createOpenIDSessionTokenProvider } = require('~/server/services/OpenIDSessionRefresh');
const { requireJwtAuth, configMiddleware } = require('~/server/middleware');
const { getMCPManager, getFlowStateManager } = require('~/config');
const { getLogStores } = require('~/cache');
const db = require('~/models');

const router = express.Router();

/** MCP server key for TSPI Brain in librechat.yaml (`mcpServers.tspi`). */
const TSPI_SERVER = 'tspi';

const ERROR_STATUS = { invalid_id: 400, not_found: 404, forbidden: 403, unavailable: 502 };

const checkMCPUse = generateCheckAccess({
  permissionType: PermissionTypes.MCP_SERVERS,
  permissions: [Permissions.USE],
  getRoleByName: db.getRoleByName,
});

/** Calls TSPI MCP tools as the signed-in user, through the same connection the chat uses. */
function createTspiToolCaller(req, res) {
  const identityContext = createAuthIdentityContext({ user: req.user, tenantId: getTenantId() });
  const upstreamTokenProvider = createOpenIDSessionTokenProvider({
    req,
    res,
    user: req.user,
    identityContext,
    tokenPreference: 'access_token',
  });
  const flowManager = getFlowStateManager(getLogStores(CacheKeys.FLOWS));
  const { findToken, createToken, updateToken, deleteTokens } = db;
  return async (toolName, toolArguments) => {
    const [text] = await getMCPManager(req.user.id).callTool({
      serverName: TSPI_SERVER,
      toolName,
      provider: 'openai',
      toolArguments,
      user: req.user,
      flowManager,
      tokenMethods: { findToken, createToken, updateToken, deleteTokens },
      upstreamTokenProvider,
      oboIdentityContext: identityContext,
    });
    return typeof text === 'string' ? text : '';
  };
}

router.get(
  '/reports/:reportId/pdf',
  requireJwtAuth,
  configMiddleware,
  checkMCPUse,
  async (req, res) => {
    try {
      const { filename, buffer } = await createTspiReportPdf(
        req.params.reportId,
        createTspiToolCaller(req, res),
      );
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).send(buffer);
    } catch (error) {
      if (error instanceof TspiReportError) {
        logger.warn(`[TSPI PDF] ${error.code} for report ${req.params.reportId}: ${error.message}`);
        return res.status(ERROR_STATUS[error.code] ?? 502).json({ error: error.code });
      }
      logger.error('[TSPI PDF] Failed to build report PDF', error);
      return res.status(502).json({ error: 'unavailable' });
    }
  },
);

module.exports = router;
