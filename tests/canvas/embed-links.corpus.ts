/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   embed-links.corpus.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Real-link corpus ported verbatim from drawnosaurus
 * `tools/embed-check/links.ts`: each `embed` link must resolve, each `refuse`
 * link must not. Not a test file itself (no `.test.ts` suffix); embed-providers.test.ts runs it.
 */
export interface Link {
  provider: string;
  url: string;
  /** Whether the engine should take it at all. */
  expect: "embed" | "refuse";
}

const embed = (provider: string, ...urls: string[]): Link[] =>
  urls.map((url) => ({ provider, url, expect: "embed" as const }));
const refuse = (provider: string, ...urls: string[]): Link[] =>
  urls.map((url) => ({ provider, url, expect: "refuse" as const }));

export const LINKS: Link[] = [
  ...embed(
    "youtube",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/jNQXAC9IVRw",
    "https://www.youtube.com/watch?v=9bZkp7q19f0&t=30s",
    "https://m.youtube.com/watch?v=kJQP7kiw5Fk",
    "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    "https://www.youtube.com/live/jfKfPfyJRdk",
    "https://www.youtube.com/embed/M7lc1UVf-VE",
    "https://youtu.be/aqz-KE-bpKQ?si=Gm2HkHx8bQ2l1KkQ",
    "https://www.youtube.com/playlist?list=PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI",
    "https://music.youtube.com/watch?v=dQw4w9WgXcQ&feature=share",
    "https://www.youtube-nocookie.com/embed/jNQXAC9IVRw",
    "https://www.youtube.com/watch?v=YE7VzlLtp-4",
    "https://www.youtube.com/watch?v=LXb3EKWsInQ",
    "youtube.com/watch?v=ScMzIvxBSi4",
    "https://www.youtube.com/watch?v=OPf0YbXqDm0",
    "https://youtu.be/fJ9rUzIMcZQ",
    "https://www.youtube.com/watch?v=JGwWNGJdvx8&list=RDJGwWNGJdvx8",
    '<iframe width="560" height="315" src="https://www.youtube.com/embed/dQw4w9WgXcQ?si=abc" title="YouTube video player" frameborder="0" allowfullscreen></iframe>',
  ),
  ...embed(
    "vimeo",
    "https://vimeo.com/76979871",
    "https://vimeo.com/22439234",
    "https://player.vimeo.com/video/1084537",
    "https://vimeo.com/channels/staffpicks/148751763",
    "https://vimeo.com/336812660",
    "https://vimeo.com/90509568",
    "https://vimeo.com/1084537",
  ),
  ...embed(
    "loom",
    "https://www.loom.com/share/e5b8c04bca094dd8a5507925ab887002",
    "https://www.loom.com/share/0281766fa2d04bb788eaf19e65135184",
  ),
  ...embed(
    "dailymotion",
    "https://www.dailymotion.com/video/x84sh87",
    "https://www.dailymotion.com/video/x7tgad0",
    "https://dai.ly/x8oybe4",
  ),
  ...embed(
    "twitch",
    "https://www.twitch.tv/monstercat",
    "https://www.twitch.tv/twitchgaming",
    "https://www.twitch.tv/videos/1000000000",
  ),
  ...embed(
    "tiktok",
    "https://www.tiktok.com/@scout2015/video/6718335390845095173",
    "https://www.tiktok.com/@tiktok/video/7106594312292453675",
  ),
  ...embed("streamable", "https://streamable.com/moo", "https://streamable.com/e/moo"),
  ...embed(
    "ted",
    "https://www.ted.com/talks/ken_robinson_do_schools_kill_creativity",
    "https://www.ted.com/talks/simon_sinek_how_great_leaders_inspire_action",
  ),
  ...embed(
    "bilibili",
    "https://www.bilibili.com/video/BV1GJ411x7h7",
    "https://www.bilibili.com/video/BV1xx411c7mD",
  ),
  ...embed(
    "facebook",
    "https://www.facebook.com/facebook/videos/10153231379946729/",
    "https://www.facebook.com/watch/?v=10153231379946729",
  ),
  ...embed(
    "instagram",
    "https://www.instagram.com/p/CvRHtJvLTdy/",
    "https://www.instagram.com/p/BfqnATHh5xY/",
  ),
  ...embed(
    "twitter",
    "https://twitter.com/jack/status/20",
    "https://x.com/elonmusk/status/1519480761749016577",
    "https://x.com/NASA/status/1781016426843562230?s=20",
    '<blockquote class="twitter-tweet"><p lang="en" dir="ltr">just setting up my twttr</p>&mdash; jack (@jack) <a href="https://twitter.com/jack/status/20?ref_src=twsrc%5Etfw">March 21, 2006</a></blockquote>',
  ),
  ...embed(
    "reddit",
    "https://www.reddit.com/r/pics/comments/92dd8/test_post_please_ignore/",
    "https://www.reddit.com/r/AskReddit/comments/1bv2g6q/",
    "https://www.reddit.com/r/aww/comments/90bu6w/heat_index_was_110_degrees_so_we_offered_him_a/",
  ),
  ...embed(
    "giphy",
    "https://giphy.com/gifs/cat-funny-JIX9t2j0ZTN9S",
    "https://media.giphy.com/media/3o7aD2saalBwwftBIY/giphy.gif",
    "https://giphy.com/gifs/rick-roll-Vuw9m5wXviFIQ",
  ),
  ...embed(
    "spotify",
    "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT",
    "https://open.spotify.com/album/6XhjNHCyCDyyGJRM5mg40G",
    "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
    "https://open.spotify.com/artist/0gxyHStUsqpMadRV0Di1Qt",
    "https://open.spotify.com/intl-fr/track/4cOdK2wGLETKBW3PvgPWqT?si=abc",
    "https://open.spotify.com/track/7qiZfU4dY1lWllzX7mPBI3",
  ),
  ...embed(
    "soundcloud",
    "https://soundcloud.com/forss/flickermood",
    "https://soundcloud.com/rick-astley-official/never-gonna-give-you-up-4",
    "https://soundcloud.com/forss/sets/soulhack",
  ),
  ...embed("mixcloud", "https://www.mixcloud.com/spartacus/party-time/"),
  ...embed(
    "apple",
    "https://podcasts.apple.com/us/podcast/the-daily/id1200361736",
    "https://music.apple.com/us/album/whenever-you-need-somebody/1558533900",
    "https://music.apple.com/us/album/1989-taylors-version/1708308989",
  ),
  ...embed(
    "google",
    "https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit",
    "https://docs.google.com/presentation/d/1EAYk18WDjIG-zp_0vLm3CsfQh_i8eXc67Jo2O9C6Vuc/edit",
    "https://docs.google.com/document/d/195j9eDD3ccgjQRttHhJPymLJUCOUjs-jmwTrekvdjFE/edit",
    "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3151.8354345093703!2d144.9537353153167!3d-37.81720997975159!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x6ad642af0f11fd81%3A0xf577d6a32f5a0f0!2sFederation%20Square!5e0!3m2!1sen!2sau!4v1616626000000",
    "https://calendar.google.com/calendar/embed?src=en.usa%23holiday%40group.v.calendar.google.com",
    "https://drive.google.com/file/d/0B1MVW1mFO2zmZHVRWEQ3Rkc3SVE/view",
  ),
  ...embed(
    "openstreetmap",
    "https://www.openstreetmap.org/export/embed.html?bbox=-0.0040%2C51.4761%2C0.0003%2C51.4785&layer=mapnik",
  ),
  ...embed(
    "figma",
    "https://www.figma.com/community/file/1035203688168086460",
    "https://www.figma.com/file/LKQ4FJ4bTnCSjedbRpk931/Sample-File",
  ),
  ...embed("miro", "https://miro.com/app/board/uXjVOfjmJQo=/"),
  ...embed(
    "excalidraw",
    "https://excalidraw.com/",
    "https://link.excalidraw.com/readonly/fXQ5M0xs3RwcSftuD8Mf",
  ),
  ...embed(
    "gist",
    "https://gist.github.com/octocat/6cad326836d38bd3a7ae",
    "https://gist.github.com/octocat/0831f3fbd83ac4d46451",
    '<script src="https://gist.github.com/octocat/6cad326836d38bd3a7ae.js"></script>',
  ),
  ...embed(
    "codepen",
    "https://codepen.io/team/codepen/pen/PNaGbb",
    "https://codepen.io/chriscoyier/pen/gfdDu",
    "https://codepen.io/ge1doot/pen/vRJyVG",
  ),
  ...embed("codesandbox", "https://codesandbox.io/s/new", "https://codesandbox.io/p/sandbox/new"),
  ...embed(
    "jsfiddle",
    "https://jsfiddle.net/zalun/NmudS/",
    "https://jsfiddle.net/boilerplate/react-jsx",
  ),
  ...embed(
    "stackblitz",
    "https://stackblitz.com/edit/vitejs-vite",
    "https://stackblitz.com/edit/angular",
  ),
  ...embed("val.town", "https://www.val.town/v/stevekrouse.whatIsValTown"),
  ...embed(
    "desmos",
    "https://www.desmos.com/calculator/zukjgk9iry",
    "https://www.desmos.com/calculator",
  ),
  ...embed("microsoft forms", "https://forms.office.com/r/abc123"),
  ...refuse(
    "not embeddable",
    "https://example.com/",
    "https://github.com/",
    "https://www.youtube.com/@RickAstleyYT",
    "https://twitter.com/jack",
    "javascript:alert(1)",
    "https://www.notion.so/",
    "https://en.wikipedia.org/wiki/Main_Page",
    "https://www.instagram.com/instagram/",
    "https://open.spotify.com/user/spotify",
    "data:text/html,<script>alert(1)</script>",
  ),
];
