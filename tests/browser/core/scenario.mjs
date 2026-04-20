export function defineScenario(type, subtype, action, run) {
  return { type, subtype, action, run };
}

export function formatScenarioLabel(scenario) {
  return `${scenario.type} / ${scenario.subtype} :: ${scenario.action}`;
}
