import { memo } from 'react';
import { useLocalize } from '~/hooks';

/** TSPI: the About tab shows only the TSPI Digital Twin product version. LibreChat's commit,
 *  branch, build date and the "copy diagnostics" block are intentionally not shown. */
export const TSPI_DIGITAL_VERSION = 'v1.0.0';

function About() {
  const localize = useLocalize();

  return (
    <div className="flex flex-col text-sm text-text-primary">
      <dl className="flex flex-col">
        <div className="flex items-center justify-between gap-4">
          <dt className="text-text-secondary">{localize('com_nav_about_tspi_version')}</dt>
          <dd className="text-right font-mono text-xs text-text-primary">{TSPI_DIGITAL_VERSION}</dd>
        </div>
      </dl>
    </div>
  );
}

export default memo(About);
