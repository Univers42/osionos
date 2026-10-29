/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   embed-providers.test.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { safeAspect } from "../../src/shared/lib/embed/embedPolicy.ts";
import {
  playerSrcForHost,
  resolveProviderEmbed,
} from "../../src/shared/lib/embed/embedProviders.ts";
import { ALLOWED_EMBED_HOSTS } from "../../src/shared/lib/embed/embedUrlParts.ts";
import { LINKS } from "./embed-links.corpus.ts";

test("drawnosaurus corpus: every embed link resolves, every refuse link does not", () => {
  for (const link of LINKS) {
    const embed = resolveProviderEmbed(link.url);
    if (link.expect === "embed") {
      assert.notEqual(embed, null, `${link.provider}: ${link.url.slice(0, 90)}`);
    } else {
      assert.equal(embed, null, `${link.provider}: ${link.url.slice(0, 90)}`);
    }
  }
});

test("corpus is the whole corpus, not a truncated copy", () => {
  assert.equal(LINKS.filter((l) => l.expect === "embed").length, 96);
  assert.equal(LINKS.filter((l) => l.expect === "refuse").length, 10);
});

const SRC_TABLE: Array<[string, string, string]> = [
  ["youtube watch", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"],
  ["youtube youtu.be", "https://youtu.be/jNQXAC9IVRw?si=abc", "https://www.youtube-nocookie.com/embed/jNQXAC9IVRw"],
  ["youtube timestamp 1h2m3s", "https://youtu.be/jNQXAC9IVRw?t=1h2m3s", "https://www.youtube-nocookie.com/embed/jNQXAC9IVRw?start=3723"],
  ["youtube t=30s", "https://www.youtube.com/watch?v=9bZkp7q19f0&t=30s", "https://www.youtube-nocookie.com/embed/9bZkp7q19f0?start=30"],
  ["youtube start=", "https://www.youtube.com/embed/M7lc1UVf-VE?start=15", "https://www.youtube-nocookie.com/embed/M7lc1UVf-VE?start=15"],
  ["youtube shorts", "https://www.youtube.com/shorts/dQw4w9WgXcQ", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"],
  ["youtube live", "https://www.youtube.com/live/jfKfPfyJRdk", "https://www.youtube-nocookie.com/embed/jfKfPfyJRdk"],
  ["youtube m.", "https://m.youtube.com/watch?v=kJQP7kiw5Fk", "https://www.youtube-nocookie.com/embed/kJQP7kiw5Fk"],
  ["youtube music.", "https://music.youtube.com/watch?v=dQw4w9WgXcQ&feature=share", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"],
  ["youtube playlist", "https://www.youtube.com/playlist?list=PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI", "https://www.youtube-nocookie.com/embed/videoseries?list=PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI"],
  ["youtube video in list + start", "https://www.youtube.com/watch?v=JGwWNGJdvx8&list=RDJGwWNGJdvx8&t=5", "https://www.youtube-nocookie.com/embed/JGwWNGJdvx8?list=RDJGwWNGJdvx8&start=5"],
  ["vimeo", "https://vimeo.com/76979871", "https://player.vimeo.com/video/76979871"],
  ["vimeo channel", "https://vimeo.com/channels/staffpicks/148751763", "https://player.vimeo.com/video/148751763"],
  ["vimeo unlisted hash", "https://vimeo.com/76979871/abcdef0123", "https://player.vimeo.com/video/76979871?h=abcdef0123"],
  ["vimeo player", "https://player.vimeo.com/video/1084537", "https://player.vimeo.com/video/1084537"],
  ["dailymotion", "https://www.dailymotion.com/video/x84sh87_some-title", "https://www.dailymotion.com/embed/video/x84sh87"],
  ["dai.ly", "https://dai.ly/x8oybe4", "https://www.dailymotion.com/embed/video/x8oybe4"],
  ["tiktok", "https://www.tiktok.com/@scout2015/video/6718335390845095173", "https://www.tiktok.com/player/v1/6718335390845095173"],
  ["twitch channel", "https://www.twitch.tv/monstercat", "https://player.twitch.tv/?channel=monstercat"],
  ["twitch video", "https://www.twitch.tv/videos/1000000000", "https://player.twitch.tv/?video=1000000000"],
  ["twitch clip", "https://www.twitch.tv/streamer/clip/FunnyClipSlug-abc", "https://clips.twitch.tv/embed?clip=FunnyClipSlug-abc"],
  ["twitch player url sheds parent", "https://player.twitch.tv/?channel=monstercat&parent=evil.example", "https://player.twitch.tv/?channel=monstercat"],
  ["instagram p", "https://www.instagram.com/p/CvRHtJvLTdy/", "https://www.instagram.com/p/CvRHtJvLTdy/embed"],
  ["instagram reel", "https://www.instagram.com/reel/CvRHtJvLTdy/", "https://www.instagram.com/reel/CvRHtJvLTdy/embed"],
  ["facebook video", "https://www.facebook.com/facebook/videos/10153231379946729/", "https://www.facebook.com/plugins/video.php?href=https%3A%2F%2Fwww.facebook.com%2Ffacebook%2Fvideos%2F10153231379946729%2F&show_text=false"],
  ["fb.watch", "https://fb.watch/abc123/", "https://www.facebook.com/plugins/video.php?href=https%3A%2F%2Ffb.watch%2Fabc123%2F&show_text=false"],
  ["x status", "https://x.com/NASA/status/1781016426843562230?s=20", "https://platform.twitter.com/embed/Tweet.html?id=1781016426843562230&dnt=true"],
  ["twitter status", "https://twitter.com/jack/status/20", "https://platform.twitter.com/embed/Tweet.html?id=20&dnt=true"],
  ["loom", "https://www.loom.com/share/e5b8c04bca094dd8a5507925ab887002", "https://www.loom.com/embed/e5b8c04bca094dd8a5507925ab887002"],
  ["streamable", "https://streamable.com/moo", "https://streamable.com/e/moo"],
  ["figma", "https://www.figma.com/file/LKQ4FJ4bTnCSjedbRpk931/Sample-File", "https://www.figma.com/embed?embed_host=share&url=https%3A%2F%2Fwww.figma.com%2Ffile%2FLKQ4FJ4bTnCSjedbRpk931%2FSample-File"],
  ["maps place", "https://www.google.com/maps/place/Eiffel+Tower/@48.8583701,2.2944813,17z/data=!3m1", "https://maps.google.com/maps?q=Eiffel%20Tower&ll=48.8583701,2.2944813&z=17&output=embed"],
  ["maps place encoded name", "https://maps.google.com/maps/place/Caf%C3%A9+de+Flore/@48.854,2.333,15z", "https://maps.google.com/maps?q=Caf%C3%A9%20de%20Flore&ll=48.854,2.333&z=15&output=embed"],
  ["maps coordinates", "https://www.google.com/maps/@48.8583701,-2.2944813,15z", "https://maps.google.com/maps?q=48.8583701,-2.2944813&z=15&output=embed"],
  ["maps search", "https://www.google.com/maps/search/pizza+near+me/", "https://maps.google.com/maps?q=pizza%20near%20me&output=embed"],
  ["maps q=", "https://maps.google.com/maps?q=Eiffel+Tower", "https://maps.google.com/maps?q=Eiffel%20Tower&output=embed"],
  ["google maps embed", "https://www.google.com/maps/embed?pb=!1m18!1m12", "https://www.google.com/maps/embed?pb=!1m18!1m12"],
  ["google drive", "https://drive.google.com/file/d/0B1MVW1mFO2zmZHVRWEQ3Rkc3SVE/view", "https://drive.google.com/file/d/0B1MVW1mFO2zmZHVRWEQ3Rkc3SVE/preview"],
  ["google docs", "https://docs.google.com/document/d/195j9eDD3ccgjQRttHhJPymLJUCOUjs-jmwTrekvdjFE/edit", "https://docs.google.com/document/d/195j9eDD3ccgjQRttHhJPymLJUCOUjs-jmwTrekvdjFE/preview"],
  ["google sheets", "https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit", "https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/preview"],
  ["google slides (embed.rs uses /embed)", "https://docs.google.com/presentation/d/1EAYk18WDjIG-zp_0vLm3CsfQh_i8eXc67Jo2O9C6Vuc/edit", "https://docs.google.com/presentation/d/1EAYk18WDjIG-zp_0vLm3CsfQh_i8eXc67Jo2O9C6Vuc/embed"],
  ["google docs published", "https://docs.google.com/document/d/e/2PACX-abc/pub", "https://docs.google.com/document/d/e/2PACX-abc/pub?embedded=true"],
  ["google calendar", "https://calendar.google.com/calendar/embed?src=a%40b.c", "https://calendar.google.com/calendar/embed?src=a%40b.c"],
  ["codepen", "https://codepen.io/chriscoyier/pen/gfdDu", "https://codepen.io/chriscoyier/embed/gfdDu?default-tab=result"],
  ["codepen team", "https://codepen.io/team/codepen/pen/PNaGbb", "https://codepen.io/team/codepen/embed/PNaGbb?default-tab=result"],
  ["codesandbox", "https://codesandbox.io/s/new", "https://codesandbox.io/embed/new"],
  ["stackblitz", "https://stackblitz.com/edit/vitejs-vite", "https://stackblitz.com/edit/vitejs-vite?embed=1"],
  ["jsfiddle", "https://jsfiddle.net/zalun/NmudS/", "https://jsfiddle.net/zalun/NmudS/embedded/"],
  ["gist", "https://gist.github.com/octocat/6cad326836d38bd3a7ae", "https://gist.github.com/octocat/6cad326836d38bd3a7ae"],
  ["miro", "https://miro.com/app/board/uXjVOfjmJQo=/", "https://miro.com/app/live-embed/uXjVOfjmJQo=/"],
  ["excalidraw", "https://excalidraw.com/", "https://excalidraw.com/"],
  ["reddit", "https://www.reddit.com/r/pics/comments/92dd8/test_post_please_ignore/", "https://embed.reddit.com/r/pics/comments/92dd8/test_post_please_ignore/?embed=true"],
  ["giphy", "https://giphy.com/gifs/cat-funny-JIX9t2j0ZTN9S", "https://giphy.com/embed/JIX9t2j0ZTN9S"],
  ["soundcloud", "https://soundcloud.com/forss/flickermood", "https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Fforss%2Fflickermood"],
  ["spotify track", "https://open.spotify.com/intl-fr/track/4cOdK2wGLETKBW3PvgPWqT?si=abc", "https://open.spotify.com/embed/track/4cOdK2wGLETKBW3PvgPWqT"],
  ["spotify playlist", "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M", "https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M"],
  ["apple music", "https://music.apple.com/us/album/whenever-you-need-somebody/1558533900", "https://embed.music.apple.com/us/album/whenever-you-need-somebody/1558533900"],
  ["apple podcasts", "https://podcasts.apple.com/us/podcast/the-daily/id1200361736", "https://embed.podcasts.apple.com/us/podcast/the-daily/id1200361736"],
  ["mixcloud", "https://www.mixcloud.com/spartacus/party-time/", "https://www.mixcloud.com/widget/iframe/?feed=%2Fspartacus%2Fparty-time%2F"],
  ["bilibili bv", "https://www.bilibili.com/video/BV1GJ411x7h7", "https://player.bilibili.com/player.html?bvid=BV1GJ411x7h7&autoplay=0"],
  ["ted", "https://www.ted.com/talks/ken_robinson_do_schools_kill_creativity", "https://embed.ted.com/talks/ken_robinson_do_schools_kill_creativity"],
  ["desmos", "https://www.desmos.com/calculator/zukjgk9iry", "https://www.desmos.com/calculator/zukjgk9iry?embed"],
  ["openstreetmap", "https://www.openstreetmap.org/export/embed.html?bbox=-0.0040%2C51.4761&layer=mapnik", "https://www.openstreetmap.org/export/embed.html?bbox=-0.0040%2C51.4761&layer=mapnik"],
  ["val.town", "https://www.val.town/v/stevekrouse.whatIsValTown", "https://val.town/embed/stevekrouse.whatIsValTown"],
  ["simplepdf", "https://simplepdf.eu/editor?open=x", "https://simplepdf.eu/editor?open=x"],
  ["ms forms", "https://forms.office.com/r/abc123", "https://forms.office.com/r/abc123?embed=true"],
  ["iframe snippet", '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ?si=abc"></iframe>', "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"],
  ["scheme-less", "youtu.be/jNQXAC9IVRw", "https://www.youtube-nocookie.com/embed/jNQXAC9IVRw"],
];

for (const [name, input, src] of SRC_TABLE) {
  test(`src table: ${name}`, () => {
    assert.equal(resolveProviderEmbed(input)?.src, src);
  });
}

test("every produced src resolves to itself (idempotent)", () => {
  for (const [name, input] of SRC_TABLE.map(([n, i]) => [n, i] as const)) {
    const first = resolveProviderEmbed(input);
    if (first === null || first.provider === "Twitch") continue;
    assert.equal(resolveProviderEmbed(first.src)?.src, first.src, name);
  }
});

test("kinds, thumbs, heights and aspects", () => {
  const yt = resolveProviderEmbed("https://youtu.be/dQw4w9WgXcQ");
  assert.deepEqual(yt, {
    provider: "YouTube",
    kind: "video",
    src: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    aspect: "16/9",
    thumb: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
  });
  assert.equal(resolveProviderEmbed("https://www.youtube.com/playlist?list=PLabc")?.thumb, undefined);
  assert.equal(resolveProviderEmbed("https://www.youtube.com/shorts/dQw4w9WgXcQ")?.aspect, "9/16");
  const track = resolveProviderEmbed("https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT");
  assert.equal(track?.kind, "audio");
  assert.equal(track?.height, 152);
  assert.equal(resolveProviderEmbed("https://open.spotify.com/album/6XhjNHCyCDyyGJRM5mg40G")?.height, 352);
  assert.equal(resolveProviderEmbed("https://soundcloud.com/forss/sets/soulhack")?.height, 450);
  assert.equal(resolveProviderEmbed("https://www.mixcloud.com/spartacus/party-time/")?.aspect, "4/1");
  assert.equal(resolveProviderEmbed("https://gist.github.com/octocat/6cad326836d38bd3a7ae")?.frameable, false);
});

test("every produced aspect survives safeAspect unchanged", () => {
  for (const link of LINKS.filter((l) => l.expect === "embed")) {
    const embed = resolveProviderEmbed(link.url);
    assert.equal(safeAspect(embed?.aspect), embed?.aspect, link.url.slice(0, 80));
  }
});

test("playerSrcForHost adds parent for Twitch only", () => {
  const twitch = resolveProviderEmbed("https://www.twitch.tv/monstercat");
  const yt = resolveProviderEmbed("https://youtu.be/dQw4w9WgXcQ");
  assert.ok(twitch !== null && yt !== null);
  assert.equal(playerSrcForHost(twitch, "osionos.example"), "https://player.twitch.tv/?channel=monstercat&parent=osionos.example");
  assert.equal(playerSrcForHost(twitch, ""), twitch.src);
  assert.equal(playerSrcForHost(yt, "osionos.example"), yt.src);
  const clip = resolveProviderEmbed("https://clips.twitch.tv/FunnyClip-abc");
  assert.equal(clip && playerSrcForHost(clip, "h.example"), "https://clips.twitch.tv/embed?clip=FunnyClip-abc&parent=h.example");
});

test("hosts match on a dot boundary", () => {
  const lookalikes = [
    "https://notyoutube.com/watch?v=x",
    "https://youtube.com.evil.example/watch?v=abc",
    "https://evilyoutu.be/abc",
    "https://vimeo.com.evil.example/76979871",
    "https://evil-x.com/a/status/1",
    "https://notvimeo.com/76979871",
  ];
  for (const url of lookalikes) assert.equal(resolveProviderEmbed(url), null, url);
  assert.ok(ALLOWED_EMBED_HOSTS.length === 44);
});

test("ids that could build another URL are refused", () => {
  const hostile = [
    "https://youtu.be/abc%2F..%2Fx",
    "https://www.youtube.com/watch?v=abc%26list%3Dx",
    "https://www.youtube.com/watch?v=" + "a".repeat(201),
    "https://www.tiktok.com/@u/video/12a",
    "https://x.com/u/status/12%2F3",
    "https://open.spotify.com/track/abc%2Fdef",
    "https://www.dailymotion.com/video/x1%2Fy",
    "https://www.twitch.tv/chan%2Fnel",
    "https://codepen.io/u/pen/a%2Fb",
    "https://codepen.io/a..b/pen/xyz",
    "https://docs.google.com/document/d/a%2Fb/edit",
    "https://docs.google.com/document/d/e/",
  ];
  for (const url of hostile) assert.equal(resolveProviderEmbed(url), null, url);
  // The URL is normalised the way a browser would first: `/abc/../x` is `/x`, the page
  // the real site would serve, and trailing segments are never carried into the player URL.
  assert.equal(resolveProviderEmbed("https://youtu.be/abc/../x?v=1")?.src, "https://www.youtube-nocookie.com/embed/x");
  assert.equal(resolveProviderEmbed("https://youtu.be/abc/def?v=1")?.src, "https://www.youtube-nocookie.com/embed/abc");
  assert.equal(resolveProviderEmbed("https://vimeo.com/123/..%2F..")?.src, "https://player.vimeo.com/video/123");
});

test("non-http schemes, userinfo hosts, empties and garbage resolve to null", () => {
  const refused = [
    "",
    "   ",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "ftp://youtube.com/watch?v=abc",
    "https://youtube.com@evil.example/watch?v=abc",
    "https://evil.example/https://youtube.com/watch?v=abc",
    "<div>nothing</div>",
    "https://www.twitch.tv/directory",
    "https://youtube.com/watch",
    "https://www.figma.com/",
  ];
  for (const url of refused) assert.equal(resolveProviderEmbed(url), null, JSON.stringify(url));
});

test("timestamps: plain, h/m/s, junk and overflow", () => {
  const start = (q: string): string | undefined =>
    resolveProviderEmbed(`https://youtu.be/dQw4w9WgXcQ?${q}`)?.src.split("start=")[1];
  assert.equal(start("t=90"), "90");
  assert.equal(start("t=1m30s"), "90");
  assert.equal(start("start=2h"), "7200");
  assert.equal(start("t=abc"), undefined);
  assert.equal(start("t=30x"), undefined);
  assert.equal(start("t=99999999999999999999"), "2147483647");
});

const MAPS_BASE = "https://maps.google.com/maps?";

test("maps links are rebuilt on maps.google.com with output=embed, never passed through", () => {
  const embed = resolveProviderEmbed("https://www.google.com/maps/place/Eiffel+Tower/@48.8583701,2.2944813,17z");
  assert.equal(embed?.provider, "Google Maps");
  assert.equal(embed?.kind, "rich");
  assert.ok(embed?.src.startsWith(MAPS_BASE));
  assert.ok(embed?.src.endsWith("&output=embed"));
});

test("hostile maps inputs yield a safe src or null", () => {
  const hostile = [
    "https://www.google.com/maps/place/a%26output%3Dx%22onload%3D1/@48.85,2.29,17z",
    "https://www.google.com/maps/place/%22%3E%3Cscript%3E/@48.85,2.29,17z",
    "https://www.google.com/maps/place/javascript:alert(1)/@48.85,2.29,17z",
    "https://www.google.com/maps/search/javascript%3Aalert(1)",
    "https://www.google.com/maps?q=a%26output%3Dx%22",
    "https://www.google.com/maps?q=%00%0d%0a",
  ];
  for (const url of hostile) {
    const src = resolveProviderEmbed(url)?.src;
    if (src === undefined) continue;
    const query = src.slice(MAPS_BASE.length);
    assert.ok(src.startsWith(MAPS_BASE), url);
    assert.match(query, /^[A-Za-z0-9%._~,=&-]+$/, url);
    assert.equal(query.split("&").filter((pair) => pair.startsWith("output=")).length, 1, url);
    assert.ok(query.endsWith("&output=embed"), url);
  }
  const first = resolveProviderEmbed(hostile[0])?.src;
  assert.equal(first, `${MAPS_BASE}q=a%26output%3Dx%22onload%3D1&ll=48.85,2.29&z=17&output=embed`);
});

test("maps links with out-of-range numbers or no usable shape are null", () => {
  const rejected = [
    "https://www.google.com/maps/place/X/@999,2.29,17z",
    "https://www.google.com/maps/place/X/@48.85,181,17z",
    "https://www.google.com/maps/place/X/@48.85,2.29,99z",
    "https://www.google.com/maps/place/X/@48.85,2.29,0z",
    "https://www.google.com/maps/@48.85,2.29,3a,75y",
    "https://www.google.com/maps/@abc,2.29,15z",
    "https://www.google.com/maps/search/",
    "https://www.google.com/maps/place/%E0%A4%A/@48.85,2.29,17z",
    "https://www.google.com/maps",
    "https://www.google.com/maps?z=12",
    "https://maps.app.goo.gl/AbCdEf123",
    "https://goo.gl/maps/AbCdEf123",
  ];
  for (const url of rejected) assert.equal(resolveProviderEmbed(url), null, url);
});

test("a maps embed with a pb token still passes through as written", () => {
  const url = "https://www.google.com/maps/embed?pb=!1m18!1m12";
  assert.equal(resolveProviderEmbed(url)?.src, url);
});
