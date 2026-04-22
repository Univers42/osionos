/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   scenario.mjs                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: rstancu <rstancu@student.42madrid.com>     +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/20 21:29:25 by rstancu           #+#    #+#             */
/*   Updated: 2026/04/20 21:29:26 by rstancu          ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

export function defineScenario(type, subtype, action, run, options = {}) {
  return {
    type,
    subtype,
    action,
    run,
    needsBrowser: options.needsBrowser !== false,
    serial: options.serial === true,
  };
}

export function formatScenarioLabel(scenario) {
  return `${scenario.type} / ${scenario.subtype} :: ${scenario.action}`;
}
