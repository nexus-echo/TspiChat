import { useMemo, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { EModelEndpoint, Constants, apiBaseUrl } from 'librechat-data-provider';
import {
  useGetAssistantDocsQuery,
  useGetEndpointsQuery,
  useGetStartupConfig,
} from '~/data-provider';
import { useChatContext, useAgentsMapContext, useAssistantsMapContext } from '~/Providers';
import { getIconEndpoint, getEntity, getModelSpec } from '~/utils';
import { useSubmitMessage } from '~/hooks';

/**
 * `landing` (default): every starter, centred, sent into the new chat.
 * `inline`: only the first starter, as a compact action above the chat box of an open conversation.
 * It starts a fresh chat and sends the starter there, so a new analysis never mixes with the
 * case already in this conversation.
 */
type ConversationStartersProps = { variant?: 'landing' | 'inline' };

/** A full load of `/c/new` resets the composer, so `?prompt=…&submit=true` is sent exactly once. */
const startInNewChat = (text: string) => {
  const params = new URLSearchParams({ prompt: text, submit: 'true' });
  window.location.assign(`${apiBaseUrl()}/c/new?${params.toString()}`);
};

const ConversationStarters = ({ variant = 'landing' }: ConversationStartersProps) => {
  const { conversation, isSubmitting } = useChatContext();
  const agentsMap = useAgentsMapContext();
  const assistantMap = useAssistantsMapContext();
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const { data: startupConfig } = useGetStartupConfig();

  const endpointType = useMemo(() => {
    let ep = conversation?.endpoint ?? '';
    if (ep === EModelEndpoint.azureOpenAI) {
      ep = EModelEndpoint.openAI;
    }
    return getIconEndpoint({
      endpointsConfig,
      iconURL: conversation?.iconURL,
      endpoint: ep,
    });
  }, [conversation?.endpoint, conversation?.iconURL, endpointsConfig]);

  const { data: documentsMap = new Map() } = useGetAssistantDocsQuery(endpointType, {
    select: (data) => new Map(data.map((dbA) => [dbA.assistant_id, dbA])),
  });

  const { entity, isAgent } = getEntity({
    endpoint: endpointType,
    agentsMap,
    assistantMap,
    agent_id: conversation?.agent_id,
    assistant_id: conversation?.assistant_id,
  });

  const modelSpec = useMemo(
    () => getModelSpec({ specName: conversation?.spec, startupConfig }),
    [conversation?.spec, startupConfig],
  );

  const conversation_starters = useMemo(() => {
    if (entity?.conversation_starters?.length) {
      return entity.conversation_starters;
    }

    if (modelSpec?.conversation_starters?.length) {
      return modelSpec.conversation_starters;
    }

    if (isAgent) {
      return [];
    }

    return documentsMap.get(entity?.id ?? '')?.conversation_starters ?? [];
  }, [documentsMap, isAgent, entity, modelSpec]);

  const { submitMessage } = useSubmitMessage();
  const sendConversationStarter = useCallback(
    (text: string) => submitMessage({ text }),
    [submitMessage],
  );

  if (!conversation_starters.length) {
    return null;
  }

  if (variant === 'inline') {
    const text = conversation_starters[0];
    return (
      <div className="mx-auto flex w-full max-w-3xl px-4 pb-1 pt-2 xl:max-w-4xl">
        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => startInNewChat(text)}
          className="inline-flex items-center gap-1.5 rounded-full border border-border-medium bg-surface-secondary px-3 py-1.5 text-xs font-medium text-text-secondary shadow-sm transition-colors duration-200 hover:border-border-heavy hover:bg-surface-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="size-3.5" aria-hidden="true" />
          <span>{text}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="mb-8 mt-2 flex w-full flex-wrap items-stretch justify-center gap-2 px-4">
      {conversation_starters
        .slice(0, Constants.MAX_CONVO_STARTERS)
        .map((text: string, index: number) => (
          <button
            key={index}
            onClick={() => sendConversationStarter(text)}
            style={{ animationDelay: `${index * 75}ms`, animationFillMode: 'backwards' }}
            className="flex max-w-[16rem] cursor-pointer items-center justify-center rounded-2xl border border-border-medium bg-surface-secondary px-4 py-2.5 text-center text-sm text-text-secondary shadow-sm transition-colors duration-200 fade-in hover:border-border-heavy hover:bg-surface-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
          >
            <span className="line-clamp-2 text-balance break-words">{text}</span>
          </button>
        ))}
    </div>
  );
};

export default ConversationStarters;
