import "dotenv/config";
import { inArray, sql } from "drizzle-orm";
import { db } from "./index";
import {
  messages,
  replies,
  rooms,
  settings,
  topics,
  topicLikes,
  users,
  waitlist,
} from "./schema";
import { hashPassword } from "../lib/password";

const minutesAgo = (n: number) => new Date(Date.now() - n * 60 * 1000);

async function main() {
  const existing = await db.execute(sql`select count(*)::int as n from rooms`);
  const roomCount = Number(existing.rows[0]?.n ?? 0);
  if (roomCount > 0) {
    console.log("Database already seeded — skipping.");
    return;
  }

  const roomRows = await db
    .insert(rooms)
    .values([
      {
        slug: "global",
        name: "Global Chat",
        description:
          "The main hangout for every Free Fire player. Drop in and say hi!",
        icon: "🔥",
        color: "#ff6a00",
      },
      {
        slug: "guides",
        name: "Community Guides",
        description:
          "Loadouts, sensitivity settings, drop spots and pro wisdom. Read, learn, booyah.",
        icon: "📖",
        color: "#38bdf8",
      },
      {
        slug: "vault",
        name: "The Vault",
        description:
          "Password-sealed inner circle. Voice notes burn the moment anyone leaves.",
        icon: "🔐",
        color: "#f59e0b",
      },
    ])
    .returning();

  const botPass = hashPassword("bot-pass-123");
  const botRows = await db
    .insert(users)
    .values([
      {
        username: "BooyahKing",
        passwordHash: botPass,
        uid: "224587013",
        bio: "Grandmaster II grinder. Clutch or die 🎯",
        avatarColor: "#ff6a00",
        xp: 5400,
        likes: 96,
        lastSeenAt: minutesAgo(2),
      },
      {
        username: "SniperSara",
        passwordHash: botPass,
        uid: "889301234",
        bio: "AWM main. One tap = one kill.",
        avatarColor: "#f43f5e",
        xp: 3650,
        likes: 74,
        lastSeenAt: minutesAgo(7),
      },
      {
        username: "HeadshotHarry",
        passwordHash: botPass,
        uid: "551229987",
        bio: "Headshot rate 48%. Bring me your ranked lobbies.",
        avatarColor: "#0ea5e9",
        xp: 4120,
        likes: 61,
        lastSeenAt: minutesAgo(15),
      },
      {
        username: "ClutchQueen",
        passwordHash: botPass,
        uid: "778845561",
        bio: "1v4 specialist. Never give up 💪",
        avatarColor: "#8b5cf6",
        xp: 2200,
        likes: 43,
        lastSeenAt: minutesAgo(1),
      },
      {
        username: "NoScopeNina",
        passwordHash: botPass,
        uid: "664012889",
        bio: "Rush player. Who needs scopes anyway?",
        avatarColor: "#10b981",
        xp: 1750,
        likes: 35,
        lastSeenAt: minutesAgo(30),
      },
      {
        username: "GrenadeGuru",
        passwordHash: botPass,
        uid: "990334521",
        bio: "Cook the grenade, ruin the day 💣",
        avatarColor: "#eab308",
        xp: 940,
        likes: 22,
        lastSeenAt: minutesAgo(120),
      },
      {
        username: "RushMaster",
        passwordHash: botPass,
        uid: "441998732",
        bio: "Dropping Peak since season 1.",
        avatarColor: "#ec4899",
        xp: 620,
        likes: 18,
        lastSeenAt: minutesAgo(240),
      },
      {
        username: "BattleBella",
        passwordHash: botPass,
        uid: "335577911",
        bio: "Casual grinder. Here for the booyahs 🍗",
        avatarColor: "#14b8a6",
        xp: 180,
        likes: 9,
        lastSeenAt: minutesAgo(480),
      },
    ])
    .returning();

  // Bot accounts keep the community alive but never count toward the
  // 10-seat Founding Squad cap.
  await db
    .update(users)
    .set({ isBot: true })
    .where(inArray(users.id, botRows.map((b) => b.id)));

  // Founding Squad cap, the Vault's default key + a little waitlist social proof
  await db
    .insert(settings)
    .values([
      { key: "max_players", value: "10" },
      { key: "vault_passcode_hash", value: hashPassword("BOOYAH2026") },
    ])
    .onConflictDoNothing();
  await db
    .insert(waitlist)
    .values([
      { nickname: "ShadowSniper07", note: "Diamond II, looking for a squad" },
      { nickname: "FFLegend_YT", note: "I stream FF every day" },
      { nickname: "HeadshotHina", note: "my whole squad wants in" },
    ])
    .onConflictDoNothing();

  const byName = (n: string) =>
    botRows.find((b) => b.username === n) ?? botRows[0];

  const chatSeed: Array<{ room: number; user: number; text: string; m: number }> = [
    // room 0 = Global Chat, room 1 = Community Guides (room 2 = The Vault stays silent)
    { room: 0, user: 0, text: "Yo EMBERCROWN! Who's up for some ranked tonight? 🎮", m: 55 },
    { room: 0, user: 2, text: "Just hit Heroic tier last night LETS GOO 🔥🔥", m: 50 },
    { room: 0, user: 1, text: "GG brother! Welcome to the club 😎", m: 47 },
    { room: 0, user: 3, text: "Bro the AK with a gyro scope is OP this season fr", m: 41 },
    { room: 0, user: 4, text: "Booyah! Just clutched a 1v4 with 10hp left 😤", m: 36 },
    { room: 0, user: 5, text: "Anyone know the best drop in Bermuda this season?", m: 30 },
    { room: 0, user: 6, text: "Land on Peak, thank me later 💀", m: 28 },
    { room: 0, user: 7, text: "Free diamonds giveaway?? Don't click those links bro 😂", m: 22 },
    { room: 0, user: 1, text: "This game's music when the zone closes hits different 🔥", m: 15 },
    { room: 0, user: 0, text: "Dropping a custom room code at 9PM — free entry, winner gets bragging rights!", m: 8 },
    { room: 1, user: 3, text: "Need 2 solid players for Grandmaster push. Platinum II right now, UID 778845561", m: 120 },
    { room: 1, user: 2, text: "I'm in. Diamond IV sniper, can igl. Adding you 🎯", m: 110 },
    { room: 1, user: 6, text: "Looking for a full squad for custom rooms on weekends, region India", m: 90 },
    { room: 1, user: 0, text: "Respect to everyone posting their UID. That's how squads get made 🤝", m: 80 },
    { room: 1, user: 4, text: "Any rusher squads? I push everything, need a fragger duo", m: 60 },
    { room: 1, user: 7, text: "I play support/healer role, can I join a squad that wants to rank up? 🍗", m: 45 },
    { room: 1, user: 1, text: "My sensitivity setting: General 95, Red Dot 82, 2x 72, 4x 55, AWM 48. Headshots all day.", m: 200 },
    { room: 1, user: 0, text: "Best tip for newbies: never stand still while looting. Movement is life 🏃", m: 180 },
    { room: 1, user: 5, text: "Cook grenades for 3 seconds before throwing into windows. You'll thank me.", m: 150 },
    { room: 1, user: 2, text: "Squad tip: always ping enemies, even if you think everyone saw them.", m: 130 },
    { room: 1, user: 3, text: "Glue factory trick: set your loot order before hot drops 🎒", m: 100 },
    { room: 1, user: 7, text: "For low-end devices: lower graphics, keep high FPS. FPS > looks, always.", m: 70 },
    { room: 1, user: 6, text: "Practice headshot line in training mode 10 minutes a day. It works.", m: 40 },
    { room: 0, user: 0, text: "🏆 WEEKLY SCRIM: Saturday 8PM IST. 20 squads, winner takes 1K EMBERCROWN XP. Comment to sign up!", m: 90 },
    { room: 0, user: 3, text: "Squad BooyahBabes is IN. Watch out 😈", m: 85 },
    { room: 0, user: 2, text: "Sign me up as a free agent, any squad need a sniper?", m: 80 },
    { room: 0, user: 6, text: "Are customs region-locked? We have EU + SEA players", m: 60 },
    { room: 0, user: 1, text: "Last week's final was insane. That last zone clutch 😱", m: 30 },
    { room: 0, user: 4, text: "When you revive your teammate and they die again in 3 seconds 😂😂", m: 100 },
    { room: 0, user: 7, text: "My whole squad left the drop ship, I landed alone and somehow booyahed 💀", m: 88 },
    { room: 0, user: 5, text: "Teammate: 'they're one shot'. Reality: 190hp left. Every time 😭", m: 70 },
    { room: 0, user: 6, text: "The last circle healing battle is the most stressful 60 seconds of my life", m: 50 },
    { room: 0, user: 0, text: "Drop your funniest Free Fire moment below, best story wins bragging rights 😂", m: 30 },
    { room: 0, user: 1, text: "New patch notes just dropped. AK damage nerf is real 😭", m: 150 },
    { room: 0, user: 2, text: "Anyone else getting 200+ ping since last update? NA server", m: 130 },
    { room: 0, user: 7, text: "Event calendar says Diamonds Royale is coming back this month 👀", m: 100 },
    { room: 0, user: 3, text: "Device question: does FF run at 90fps on the new midrange phones?", m: 70 },
    { room: 0, user: 5, text: "Reminder: report bugs through the official channel, don't spam them in-game 😅", m: 40 },
  ];

  for (const row of chatSeed) {
    await db.insert(messages).values({
      roomId: roomRows[row.room].id,
      userId: botRows[row.user].id,
      content: row.text,
      // Chat self-destructs after 3h — seed messages must be younger than that
      createdAt: minutesAgo(Math.min(row.m, 170)),
    });
  }

  const topicSeed: Array<{
    user: number;
    category: string;
    title: string;
    content: string;
    m: number;
    likes: number;
    replies: Array<{ user: number; text: string; m: number }>;
  }> = [
    {
      user: 1,
      category: "tips",
      title: "Best sensitivity settings for headshots in 2026?",
      content:
        "Okay so I've been experimenting for weeks and finally found my sweet spot: General 95, Red Dot 82, 2x 72, 4x 55, AWM 48. Drag headshots are way easier now. What settings are you all running? Drop your device and settings below 👇",
      m: 300,
      likes: 24,
      replies: [
        { user: 2, text: "Running almost the same! 4x at 60 for me though. iPhone 13.", m: 280 },
        { user: 4, text: "Low-end device here (snapdragon 680). Lower general to 85 or your screen stutters.", m: 260 },
        { user: 7, text: "Honestly settings are personal. But gyro on always is the real game changer.", m: 240 },
      ],
    },
    {
      user: 0,
      category: "squad",
      title: "Looking for squad to push to Grandmaster — Platinum II right now",
      content:
        "I play 6PM-11PM IST daily. Mains: rusher / secondary sniper. Looking for 3 serious players, Platinum or above, with mic (or good pings 😅). Drop your UID and rank, I'll add you. Let's get those booyahs 🍗",
      m: 150,
      likes: 31,
      replies: [
        { user: 3, text: "Diamond III rusher here. UID 778845561. Let's grind!", m: 140 },
        { user: 6, text: "Platinum I, support. Adding you now, my IGN is RushMasterTTV.", m: 120 },
        { user: 1, text: "If you still need a sniper, I'm Diamond IV. Good comms.", m: 100 },
        { user: 5, text: "Good luck squad! May your booyah be many 🏆", m: 90 },
      ],
    },
    {
      user: 0,
      category: "tournament",
      title: "🏆 Weekly Community Scrim — Saturday 8PM IST (sign up inside)",
      content:
        "Back with the weekly scrim! Rules: 4-player squads, Battle Royale, Bermuda. Winner gets 1K EMBERCROWN XP and eternal bragging rights on the leaderboard. Drop your squad name below to register. Deadline: Friday 11PM IST. Last week we had 18 squads — let's break 20 this time!",
      m: 500,
      likes: 45,
      replies: [
        { user: 3, text: "Squad BooyahBabes registered! See you in the lobby 😈", m: 490 },
        { user: 2, text: "Free agent sniper available if any squad needs one. Diamond IV.", m: 470 },
        { user: 7, text: "Can we stream it? I can cast on my channel 🎙️", m: 450 },
        { user: 6, text: "My squad is in. Team RushHour. GLHF everyone!", m: 430 },
      ],
    },
    {
      user: 7,
      category: "news",
      title: "Server ping way too high after the last patch — anyone else?",
      content:
        "Ever since the update on Tuesday my ping went from 40ms to 180-220ms. It's not my wifi (tested on two networks). SEA server. Is this a known issue? Game is barely playable in ranked 😭",
      m: 400,
      likes: 12,
      replies: [
        { user: 2, text: "Same on NA. Spikes mostly in the evening hours.", m: 380 },
        { user: 5, text: "Try switching to the beta channel, it fixed it for me.", m: 350 },
        { user: 1, text: "There's a maintenance window announced for Thursday. Should fix it.", m: 300 },
      ],
    },
    {
      user: 3,
      category: "tips",
      title: "Newbies: Top 5 mistakes that get you killed in ranked",
      content:
        "Been coaching my little brother and noticed the same 5 mistakes over and over: 1) Standing still while looting. 2) Ignoring the zone until it's too late. 3) Rushing without pinging. 4) Wasting gloo walls in open fields. 5) Reloading mid-fight in the open. Fix these and you'll rank up 2 tiers this week, guaranteed. What would you add?",
      m: 600,
      likes: 38,
      replies: [
        { user: 7, text: "6) Not using the minimap sound indicator. It's free wallhacks 😂", m: 580 },
        { user: 0, text: "7) Carrying 8 medkits and 0 grenades. Utility wins fights.", m: 560 },
        { user: 4, text: "Guilty of every single one when I started 💀", m: 540 },
      ],
    },
    {
      user: 4,
      category: "memes",
      title: "Post your funniest Free Fire moments 😂",
      content:
        "Yesterday my entire squad jumped off the airdrop ship by accident and landed in the ocean. All 4 of us. We were laughing so hard we didn't even notice the zone closing. 11th place, zero kills, 10/10 experience. Drop your best (worst) moments below!",
      m: 350,
      likes: 52,
      replies: [
        { user: 7, text: "I once drove a monster truck over my own knocked teammate. Twice. 💀", m: 340 },
        { user: 6, text: "My cat walked on my screen and I panicked-threw a grenade at my feet.", m: 320 },
        { user: 2, text: "Revived a teammate 6 times in one match. We still lost. He's still apologizing 😂", m: 300 },
        { user: 5, text: "Won a 1v1 with a pan. The other guy probably uninstalled.", m: 280 },
      ],
    },
    {
      user: 2,
      category: "tips",
      title: "What's the best character ability combo after the update?",
      content:
        "With the new ability adjustments, I'm thinking the old meta is dead. Currently testing a rush combo: character with speed boost + gloo regen + 10% damage on low HP. It feels strong in ranked but weak in scrims where everyone plays slow. What are you running this season and why?",
      m: 250,
      likes: 19,
      replies: [
        { user: 1, text: "Sniper meta is back. Silent footsteps passive is a must for rotations.", m: 230 },
        { user: 3, text: "Depends on your playstyle. Rush = speed. Camp = revive boost.", m: 210 },
        { user: 0, text: "I run double healer in squads and it's honestly underrated.", m: 190 },
      ],
    },
    {
      user: 6,
      category: "general",
      title: "Welcome to EMBERCROWN! Introduce yourself 🎉",
      content:
        "New home base for Free Fire players! Drop a comment: your IGN, region, rank, and what you play (ranked, casual, customs). Let's build this community into the biggest FF hub on the internet. 🔥",
      m: 900,
      likes: 67,
      replies: [
        { user: 0, text: "BooyahKing, India, Grandmaster II. Ranked grinder. Glad to be here!", m: 880 },
        { user: 7, text: "BattleBella, EU, Gold I. Mostly casual but trying to improve 🍗", m: 860 },
        { user: 2, text: "HeadshotHarry, NA, Diamond IV. Here for the scrims 🎯", m: 840 },
        { user: 3, text: "ClutchQueen, India, Diamond III. Ranked + tournaments. Let's gooo 💪", m: 820 },
        { user: 5, text: "GrenadeGuru, SEA, Platinum II. I only play grenades. Kidding... mostly.", m: 800 },
      ],
    },
  ];

  for (const t of topicSeed) {
    const [topic] = await db
      .insert(topics)
      .values({
        title: t.title,
        content: t.content,
        category: t.category,
        userId: botRows[t.user].id,
        likes: t.likes,
        replyCount: t.replies.length,
        lastActivityAt: minutesAgo(t.m),
        createdAt: minutesAgo(t.m),
      })
      .returning();

    for (const r of t.replies) {
      await db.insert(replies).values({
        topicId: topic.id,
        userId: botRows[r.user].id,
        content: r.text,
        createdAt: minutesAgo(r.m),
      });
    }

    // A few random likes from bot users to make counts organic
    const likers = botRows.filter((b) => b.id !== botRows[t.user].id).slice(0, 4);
    for (const liker of likers) {
      await db.insert(topicLikes).values({
        topicId: topic.id,
        userId: liker.id,
        createdAt: minutesAgo(t.m - 5),
      });
    }
  }

  // Fix reply counts after seeding
  await db.execute(sql`
    update topics t set reply_count = (
      select count(*) from replies r where r.topic_id = t.id
    )
  `);

  const totalMessages = await db.execute(
    sql`select count(*)::int as n from messages`,
  );
  const totalTopics = await db.execute(
    sql`select count(*)::int as n from topics`,
  );
  console.log(
    `Seeded: ${roomRows.length} rooms, ${botRows.length} players, ${totalMessages.rows[0]?.n} messages, ${totalTopics.rows[0]?.n} topics.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
