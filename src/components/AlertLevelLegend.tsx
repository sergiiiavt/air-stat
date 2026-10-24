import { alertLevelLabel, alertLevels } from '../alert-levels';
import { translate, type Language } from '../i18n';

export function AlertLevelLegend({ language }: { language: Language }) {
  return (
    <div className="alert-level-legend">
      <div className="alert-level-legend__keys" aria-label={translate(language, 'alertLevels')}>
        {alertLevels.map((level) => (
          <span key={level}><i className={`alert-level-key alert-level--${level}`} />{alertLevelLabel(language, level)}</span>
        ))}
      </div>
      <details className="chart-method">
        <summary>{translate(language, 'howCalculated')}</summary>
        <p>{translate(language, 'alertLevelMethod')}</p>
      </details>
    </div>
  );
}
