/* RSS shaped exactly like investingLive's, built from headlines that really
   ran on 24–25 Sep 2026. The awkward parts are deliberate: an ampersand in a
   title, a CDATA description with markup in it, a dc:creator, several
   <category> tags on one item, and one row with no date at all. */
const item = ({ id, title, at, cats = [], by = 'Adam Button', desc = '' }) => `
    <item>
      <title>${title}</title>
      <link>https://investinglive.com/news/${id}</link>
      <guid isPermaLink="false">${id}</guid>
      <pubDate>${at}</pubDate>
      <dc:creator><![CDATA[${by}]]></dc:creator>
      <description><![CDATA[${desc}]]></description>
${cats.map(c => `      <category><![CDATA[${c}]]></category>`).join('\n')}
    </item>`;

const wrap = (title, items) => `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${title}</title>
    <link>https://investinglive.com</link>
    <description>Forex news</description>
${items.join('\n')}
  </channel>
</rss>`;

export const ALL = wrap('investingLive', [
  item({ id: 'a1', title: 'Trump will meet with Xi again in November',
         at: 'Fri, 25 Sep 2026 17:44:13 GMT', cats: ['News'],
         desc: '<p>The two leaders will meet again <b>in November</b>, according to a readout.</p>' }),
  item({ id: 'a2', title: 'September final UMich consumer sentiment 48.1 vs 47.6 expected',
         at: 'Fri, 25 Sep 2026 14:00:09 GMT', cats: ['News', 'Forex'],
         desc: 'Current conditions 42.0 &amp; expectations 51.8. Prior reading was 47.6.' }),
  item({ id: 'a3', title: 'AUDUSD breaks below the 200 day MA for the first time since November 2025',
         at: 'Fri, 25 Sep 2026 13:51:14 GMT', cats: ['Technical Analysis', 'Forex'],
         by: 'Greg Michalowski',
         desc: 'The break below the 200-day moving average matters: it was the first in nearly 11 months.' }),
  item({ id: 'a4', title: 'Fed&apos;s Williams: Persistent supply shocks are making the inflation fight harder',
         at: 'Fri, 25 Sep 2026 10:13:35 GMT', cats: ['Central Banks'] }),
  item({ id: 'a5', title: 'Bitcoin continues to hold support near key swing area',
         at: 'Fri, 25 Sep 2026 09:00:00 GMT', cats: ['Cryptocurrency'], by: 'Greg Michalowski' }),
  item({ id: 'a6', title: 'FX option expiries for 25 September 10am New York cut',
         at: 'Fri, 25 Sep 2026 05:21:52 GMT', cats: ['Forex Orders'],
         desc: 'EUR/USD 1.1575 (EUR 1.66 billion) 1.1500 (EUR 1.18 billion) USD/JPY 154.00 (US$ 3.06 billion)' }),
  item({ id: 'a7', title: 'This one has no date and must be dropped', at: 'not a date', cats: ['News'] }),
]);

export const NEWS = wrap('investingLive News', [
  item({ id: 'a1', title: 'Trump will meet with Xi again in November', at: 'Fri, 25 Sep 2026 17:44:13 GMT' }),
  item({ id: 'n1', title: 'US initial jobless claims 197K vs 201K expected',
         at: 'Thu, 24 Sep 2026 12:29:41 GMT',
         desc: 'Continuing claims 1.94 million. A four-week average of 201.5K.' }),
  item({ id: 'n2', title: 'US treasury sells $44 billion of 7 year notes at a high yield of 5.085%',
         at: 'Thu, 24 Sep 2026 17:05:43 GMT' }),
]);

export const CENTRAL = wrap('investingLive Central Banks', [
  item({ id: 'a4', title: 'Fed&apos;s Williams: Persistent supply shocks are making the inflation fight harder',
         at: 'Fri, 25 Sep 2026 10:13:35 GMT' }),
  item({ id: 'c1', title: 'Sticky core inflation pushes RBA towards its highest cash rate since 2011',
         at: 'Thu, 24 Sep 2026 20:16:28 GMT' }),
]);

export const TECHNICAL = wrap('investingLive Technical Analysis', [
  item({ id: 'a3', title: 'AUDUSD breaks below the 200 day MA for the first time since November 2025',
         at: 'Fri, 25 Sep 2026 13:51:14 GMT', by: 'Greg Michalowski' }),
  item({ id: 't1', title: 'Gold Tests Crucial Technical Confluence. What Must Buyers &amp; Sellers Do Next?',
         at: 'Fri, 18 Sep 2026 14:06:12 GMT',
         desc: 'Support sits at $4230.70 with resistance up at $4408.80.' }),
]);

export const FXORDERS = wrap('investingLive Forex Orders', [
  item({ id: 'a6', title: 'FX option expiries for 25 September 10am New York cut',
         at: 'Fri, 25 Sep 2026 05:21:52 GMT' }),
]);
export const CRYPTO = wrap('investingLive Cryptocurrency', [
  item({ id: 'a5', title: 'Bitcoin continues to hold support near key swing area',
         at: 'Fri, 25 Sep 2026 09:00:00 GMT' }),
]);
export const EDUCATION = wrap('investingLive Education', [
  item({ id: 'e1', title: 'How to read an option expiry board', at: 'Wed, 23 Sep 2026 08:00:00 GMT' }),
]);

/** Route table: which fixture answers which feed URL. */
export const ROUTES = [
  [/\/feed\/news\/?$/,             NEWS],
  [/\/feed\/centralbank\/?$/,      CENTRAL],
  [/\/feed\/technicalanalysis\/?$/,TECHNICAL],
  [/\/feed\/forexorders\/?$/,      FXORDERS],
  [/\/feed\/cryptocurrency\/?$/,   CRYPTO],
  [/\/feed\/education\/?$/,        EDUCATION],
  [/\/feed\/?$/,                   ALL],
];
