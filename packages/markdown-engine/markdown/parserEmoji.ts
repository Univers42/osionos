/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   parserEmoji.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:17 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:17 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Markdown parser — common emoji map

export const EMOJI_MAP: Record<string, string> = {
  smile: '😄', laughing: '😆', blush: '😊', heart_eyes: '😍', wink: '😉',
  thinking: '🤔', thumbsup: '👍', thumbsdown: '👎', clap: '👏', fire: '🔥',
  rocket: '🚀', star: '⭐', warning: '⚠️', check: '✅', x: '❌',
  info: 'ℹ️', bulb: '💡', gear: '⚙️', lock: '🔒', key: '🔑',
  bug: '🐛', memo: '📝', book: '📖', link: '🔗', pin: '📌',
  calendar: '📅', clock: '🕐', hammer: '🔨', wrench: '🔧', zap: '⚡',
  tada: '🎉', sparkles: '✨', party_popper: '🎉', construction: '🚧',
  eyes: '👀', wave: '👋', pray: '🙏', muscle: '💪', heart: '❤️',
  broken_heart: '💔', coffee: '☕', pizza: '🍕', beer: '🍺',
  art: '🎨', musical_note: '🎵', video_game: '🎮', trophy: '🏆',
  earth_americas: '🌎', sun: '☀️', moon: '🌙', cloud: '☁️', umbrella: '☂️',
  snowflake: '❄️', package: '📦', truck: '🚚', airplane: '✈️',
  hundred: '💯', bangbang: '‼️', question: '❓', exclamation: '❗',
  plus: '➕', minus: '➖', point_right: '👉', point_left: '👈',
  arrow_right: '➡️', arrow_left: '⬅️', arrow_up: '⬆️', arrow_down: '⬇️',
  joy: '😂', '+1': '👍', '-1': '👎', smiley: '😃', grin: '😁',
  sob: '😭', cry: '😢', sweat_smile: '😅', roll_eyes: '🙄', shrug: '🤷',
  white_check_mark: '✅', heavy_check_mark: '✔️', boom: '💥', bell: '🔔',
  mag: '🔍', dart: '🎯', speech_balloon: '💬', bookmark: '🔖',
  envelope: '✉️', phone: '📞', computer: '💻', keyboard: '⌨️',
  chart_with_upwards_trend: '📈', chart_with_downwards_trend: '📉',
  red_circle: '🔴', green_circle: '🟢', yellow_circle: '🟡',
  ok_hand: '👌', raised_hands: '🙌', handshake: '🤝', brain: '🧠',
  hourglass: '⏳', stopwatch: '⏱️', label: '🏷️',
  file_folder: '📁', open_file_folder: '📂', page_facing_up: '📄',
  clipboard: '📋', pushpin: '📍', paperclip: '📎', scissors: '✂️',
  robot: '🤖', ghost: '👻', alien: '👽', skull: '💀', crown: '👑',
  gift: '🎁', balloon: '🎈', confetti_ball: '🎊', medal: '🏅',
};
