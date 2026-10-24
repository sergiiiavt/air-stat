import { alertLevelLabel, alertLevels } from '../alert-levels';
import { translate, type Language } from '../i18n';

export function AlertLevelLegend({ language, splitAlertLevels = false }: { language: Language; splitAlertLevels?: boolean }) {
  return (
    <div className="alert-level-legend">
      <div className="alert-level-legend__keys" aria-label={translate(language, splitAlertLevels ? 'alertLevels' : 'alerts')}>
        {splitAlertLevels ? alertLevels.map((level) => (
          <span key={level}><i className={`alert-level-key alert-level--${level}`} />{alertLevelLabel(language, level)}</span>
        )) : (
          <span><i className="alert-level-key alert-level--combined" />{translate(language, 'hourlyAirRaid')}</span>
        )}
      </div>
      {splitAlertLevels && <details className="chart-method">
        <summary>{translate(language, 'howCalculated')}</summary>
        <p>{translate(language, 'alertLevelMethod')}</p>
      </details>}
    </div>
  );
}
