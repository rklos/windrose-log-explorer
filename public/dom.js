const $ = (id) => document.getElementById(id);

export const els = {
  headStats:        $('head-stats'),
  severityTrigger:  $('severity-trigger'),
  severityLabel:    $('severity-trigger-label'),
  severityPopover:  $('severity-popover'),
  severityList:     $('severity-list'),
  sevAll:           $('sev-all'),
  sevNone:          $('sev-none'),
  sevReset:         $('sev-reset'),

  timeTrigger:      $('time-trigger'),
  timeLabel:        $('time-trigger-label'),
  timePopover:      $('time-popover'),
  presetList:       $('preset-list'),
  absFrom:          $('abs-from'),
  absTo:            $('abs-to'),
  absApply:         $('abs-apply'),
  absFileMin:       $('abs-file-min'),
  absFileMax:       $('abs-file-max'),

  reloadBtn:        $('reload-btn'),
  autoRefreshBtn:   $('auto-refresh-toggle'),

  searchInput:      $('search-input'),

  histogramPane:    $('histogram-pane'),
  histogramSvg:     $('histogram-svg'),
  histogramEmpty:   $('histogram-empty'),
  histogramTooltip: $('histogram-tooltip'),

  logEmpty:         $('log-empty'),
  logViewport:      $('log-viewport'),
  logSpacer:        $('log-spacer'),
  logRows:          $('log-rows'),

  measureHost:      $('measure-host'),
};
