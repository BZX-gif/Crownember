import "dotenv/config";
import { randomBytes } from "crypto";
import { asc, inArray, sql } from "drizzle-orm";
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
  // Guard on the Global room, not "any room": scripts/migrate.mjs can create
  // the Vault room before this runs, and a half-created layout must still be
  // seedable. Re-running on a live database always skips safely.
  const existing = await db.execute(
    sql`select count(*)::int as n from rooms where slug = 'global'`,
  );
  const roomCount = Number(existing.rows[0]?.n ?? 0);
  if (roomCount > 0) {
    console.log("Database already seeded — skipping.");
    return;
  }

  await db
    .insert(rooms)
    .values([
      {
        slug: "global",
        name: "Global Chat",
        description:
          "The main hangout. Drop in, say hi, join the conversation.",
        icon: "💬",
        color: "#fff",
      },
      {
        slug: "guides",
        name: "Community Corner",
        description:
          "Tips, recommendations, life hacks, and shared wisdom. Read, learn, grow.",
        icon: "📖",
        color: "#a3a3a3",
      },
      {
        slug: "vault",
        name: "The Vault",
        description:
          "Password-sealed inner circle. Voice notes burn the moment anyone leaves.",
        icon: "🔐",
        color: "#525252",
      },
    ])
    .onConflictDoNothing();

  // Re-read after insert so a pre-existing room (e.g. the Vault created by
  // migrate.mjs) is present in the map instead of breaking index access.
  const roomRows = await db.select().from(rooms).orderBy(asc(rooms.id));
  const roomBySlug = new Map(roomRows.map((r) => [r.slug, r.id]));

  // Bots can never log in (the login route refuses is_bot accounts) and
  // each gets a random throwaway hash — no shared secret anywhere in code.
  const botPass = hashPassword(randomBytes(32).toString("hex"));
  const botRows = await db
    .insert(users)
    .values([
      {
        username: "alex",
        passwordHash: botPass,
        uid: "",
        bio: "Product designer. Coffee enthusiast. Building things people love.",
        avatarColor: "#fff",
        xp: 5400,
        likes: 96,
        lastSeenAt: minutesAgo(2),
      },
      {
        username: "sarah",
        passwordHash: botPass,
        uid: "",
        bio: "Writer & storyteller. Exploring the intersection of tech and human nature.",
        avatarColor: "#f43f5e",
        xp: 3650,
        likes: 74,
        lastSeenAt: minutesAgo(7),
      },
      {
        username: "marcus",
        passwordHash: botPass,
        uid: "",
        bio: "Software engineer. Open source contributor. Always learning.",
        avatarColor: "#0ea5e9",
        xp: 4120,
        likes: 61,
        lastSeenAt: minutesAgo(15),
      },
      {
        username: "priya",
        passwordHash: botPass,
        uid: "",
        bio: "Creative strategist. Design systems advocate. Minimalist at heart.",
        avatarColor: "#8b5cf6",
        xp: 2200,
        likes: 43,
        lastSeenAt: minutesAgo(1),
      },
      {
        username: "jordan",
        passwordHash: botPass,
        uid: "",
        bio: "Photographer. Traveler. Capturing moments that matter.",
        avatarColor: "#10b981",
        xp: 1750,
        likes: 35,
        lastSeenAt: minutesAgo(30),
      },
      {
        username: "maya",
        passwordHash: botPass,
        uid: "",
        bio: "Researcher. Curious about everything. Science + art = magic.",
        avatarColor: "#eab308",
        xp: 940,
        likes: 22,
        lastSeenAt: minutesAgo(120),
      },
      {
        username: "david",
        passwordHash: botPass,
        uid: "",
        bio: "Founder. Builder. Turning ideas into reality, one step at a time.",
        avatarColor: "#ec4899",
        xp: 620,
        likes: 18,
        lastSeenAt: minutesAgo(240),
      },
      {
        username: "emma",
        passwordHash: botPass,
        uid: "",
        bio: "Teacher. Lifelong learner. Empowering others through knowledge.",
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

  // Founding Squad cap + a little waitlist social proof. The Vault gets NO
  // default passcode: a founder forges the first key in-app, so no secret is
  // ever committed to this repository. (If your DB predates this change and
  // still unlocks with the old default key, rotate it from inside the Vault.)
  await db
    .insert(settings)
    .values([{ key: "max_players", value: "10" }])
    .onConflictDoNothing();
  await db
    .insert(waitlist)
    .values([
      { nickname: "creative_mind", note: "Excited to join the community!" },
      { nickname: "builder_joe", note: "Been looking for a platform like this" },
      { nickname: "designer_amy", note: "Love the minimal aesthetic" },
    ])
    .onConflictDoNothing();

  const byName = (n: string) =>
    botRows.find((b) => b.username === n) ?? botRows[0];

  const chatSeed: Array<{ room: number; user: number; text: string; m: number }> = [
    // room 0 = Global Chat, room 1 = Community Corner (room 2 = The Vault stays silent)
    { room: 0, user: 0, text: "Yo VYRON! Who's up for a late-night discussion? 💭", m: 55 },
    { room: 0, user: 2, text: "Just shipped a new feature last night. Feels good! 🚀", m: 50 },
    { room: 0, user: 1, text: "Love the energy here. Welcome to the club ✨", m: 47 },
    { room: 0, user: 3, text: "The new design system is coming together beautifully", m: 41 },
    { room: 0, user: 4, text: "Just finished a 1v4 design review and survived 😤", m: 36 },
    { room: 0, user: 5, text: "Anyone know the best coffee spots in downtown?", m: 30 },
    { room: 0, user: 6, text: "That little bakery on 5th, thank me later 🥐", m: 28 },
    { room: 0, user: 7, text: "Free productivity course giveaway?? Don't click those links 😂", m: 22 },
    { room: 0, user: 1, text: "The way sunset light hits the city different 🌅", m: 15 },
    { room: 0, user: 0, text: "Dropping a community event at 9PM — free entry, great conversations!", m: 8 },
    { room: 1, user: 3, text: "Need 2 solid collaborators for a side project. Designer + dev preferred", m: 120 },
    { room: 1, user: 2, text: "I'm in. Full-stack dev, can handle backend. Adding you 🤝", m: 110 },
    { room: 1, user: 6, text: "Looking for a creative collective for weekend projects, remote-friendly", m: 90 },
    { room: 1, user: 0, text: "Respect to everyone sharing their work. That's how communities grow", m: 80 },
    { room: 1, user: 4, text: "Any writer communities? I draft essays, need thoughtful feedback", m: 60 },
    { room: 1, user: 7, text: "I do research/analysis, can I join a group that values deep work? 📚", m: 45 },
    { room: 1, user: 1, text: "My writing routine: 500 words before coffee. Consistency > intensity", m: 200 },
    { room: 1, user: 0, text: "Best tip for creators: never wait for perfect. Ship, learn, iterate 🏃", m: 180 },
    { room: 1, user: 5, text: "Batch your creative work. Deep focus blocks > fragmented hours", m: 150 },
    { room: 1, user: 2, text: "Team tip: always document decisions, even if you think everyone knows", m: 130 },
    { room: 1, user: 3, text: "Design system trick: name your tokens semantically, not visually 🎨", m: 100 },
    { room: 1, user: 7, text: "For deep work: phone in another room, noise-canceling on, timer set", m: 70 },
    { room: 1, user: 6, text: "Practice your craft 30 minutes a day. Compound interest applies to skills", m: 40 },
    { room: 0, user: 0, text: "🏆 MONTHLY SHOWCASE: Last Friday 7PM. Share your work, get feedback, connect!", m: 90 },
    { room: 0, user: 3, text: "Creative Collective is IN. Can't wait to see what everyone's building 😊", m: 85 },
    { room: 0, user: 2, text: "Sign me up as a collaborator, any project need a dev?", m: 80 },
    { room: 0, user: 6, text: "Is the showcase hybrid? We have folks in different timezones", m: 60 },
    { room: 0, user: 1, text: "Last month's showcase was incredible. That closing discussion 🤯", m: 30 },
    { room: 0, user: 4, text: "When you think you're done editing and find three more typos 😂", m: 100 },
    { room: 0, user: 7, text: "My whole team pivoted, I stayed and somehow shipped the MVP 💀", m: 88 },
    { room: 0, user: 5, text: "Client: 'it's one small change'. Reality: refactor the entire auth system 😭", m: 70 },
    { room: 0, user: 6, text: "The final polish before launch is the most stressful 60 minutes of my life", m: 50 },
    { room: 0, user: 0, text: "Drop your funniest work moment below, best story gets featured 😂", m: 30 },
    { room: 0, user: 1, text: "New platform update just dropped. Dark mode improvements are real ✨", m: 150 },
    { room: 0, user: 2, text: "Anyone else getting inspired by the community energy lately? 🔥", m: 130 },
    { room: 0, user: 7, text: "Calendar says community retreat is coming up this quarter 👀", m: 100 },
    { room: 0, user: 3, text: "Tool question: what's your current favorite note-taking setup?", m: 70 },
    { room: 0, user: 5, text: "Reminder: share your work in progress, not just the highlight reel 😅", m: 40 },
  ];

  const chatRoomIds = [roomBySlug.get("global"), roomBySlug.get("guides")];
  for (const row of chatSeed) {
    const roomId = chatRoomIds[row.room];
    if (!roomId) continue;
    await db.insert(messages).values({
      roomId,
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
      title: "Best productivity setups for deep work in 2025?",
      content:
        "Okay so I've been experimenting for months and finally found my sweet spot: time-blocked calendar, single-task focus, phone in another room, 90-min sessions with 20-min breaks. Flow state is way easier now. What setups are you all running? Drop your tools and rituals below 👇",
      m: 300,
      likes: 24,
      replies: [
        { user: 2, text: "Running almost the same! 60-min blocks for me though. Standing desk helps.", m: 280 },
        { user: 4, text: "Small space here. Noise-canceling headphones + ambient noise app = game changer.", m: 260 },
        { user: 7, text: "Honestly setup is personal. But protecting your attention is the real game changer.", m: 240 },
      ],
    },
    {
      user: 0,
      category: "general",
      title: "Looking for collaborators on a passion project — designer + writer needed",
      content:
        "I build weekends 10AM-4PM EST. Skills: product strategy + frontend. Looking for 2 serious collaborators, portfolio or samples preferred, with good async communication (or good sync calls 😅). Drop your work and what you're into, I'll reach out. Let's build something meaningful 🤝",
      m: 150,
      likes: 31,
      replies: [
        { user: 3, text: "Product designer here. 3yrs exp, love systems thinking. Let's connect!", m: 140 },
        { user: 6, text: "Writer/editor, 5yrs. Adding you now, my work is at jordanwrites.com.", m: 120 },
        { user: 1, text: "If you still need research/strategy, I do that. Good comms, reliable.", m: 100 },
        { user: 5, text: "Good luck team! May your launch be smooth 🌟", m: 90 },
      ],
    },
    {
      user: 0,
      category: "general",
      title: "🏆 Monthly Community Showcase — Last Friday 7PM (sign up inside)",
      content:
        "Back with the monthly showcase! Rules: 5-min demo, any project (side hustle, art, writing, code, research). Winner gets featured on the community highlight page and eternal bragging rights. Drop your project name below to register. Deadline: Thursday 11PM. Last month we had 18 presenters — let's break 20 this time!",
      m: 500,
      likes: 45,
      replies: [
        { user: 3, text: "Creative Collective registered! See you there 🎨", m: 490 },
        { user: 2, text: "Free agent dev available if any project needs one. React/Node.", m: 470 },
        { user: 7, text: "Can we record it? I can edit the highlight reel 🎬", m: 450 },
        { user: 6, text: "My group is in. Team Midnight Builders. Excited for this!", m: 430 },
      ],
    },
    {
      user: 7,
      category: "general",
      title: "Platform performance feels slow lately — anyone else noticing?",
      content:
        "Ever since the update on Tuesday my feed loads 2-3x slower. It's not my connection (tested on two networks). Mobile app especially. Is this a known issue? Experience is noticeably degraded 😕",
      m: 400,
      likes: 12,
      replies: [
        { user: 2, text: "Same on desktop. Spikes mostly in the evening hours.", m: 380 },
        { user: 5, text: "Try clearing cache, it fixed it for me.", m: 350 },
        { user: 1, text: "There's a maintenance window announced for Thursday. Should help.", m: 300 },
      ],
    },
    {
      user: 3,
      category: "tips",
      title: "Beginners: Top 5 mistakes that stall creative growth",
      content:
        "Been mentoring junior designers and noticed the same 5 patterns over and over: 1) Waiting for perfect before sharing. 2) Ignoring feedback until it's too late. 3) Building without talking to users. 4) Over-engineering early versions. 5) Comparing your start to someone's middle. Fix these and you'll accelerate 2x this quarter, guaranteed. What would you add?",
      m: 600,
      likes: 38,
      replies: [
        { user: 7, text: "6) Not building a personal knowledge base. It's compound interest 😂", m: 580 },
        { user: 0, text: "7) Consuming 10x more than creating. Output > input, always.", m: 560 },
        { user: 4, text: "Guilty of every single one when I started 💀", m: 540 },
      ],
    },
    {
      user: 4,
      category: "general",
      title: "Post your funniest work/creative moments 😂",
      content:
        "Yesterday I presented a prototype to stakeholders and my cat walked across the keyboard, opening 47 tabs. All of us watched in silence. 11th revision, zero approvals, 10/10 memory. Drop your best (worst) moments below!",
      m: 350,
      likes: 52,
      replies: [
        { user: 7, text: "I once deployed to prod instead of staging. Twice. 💀", m: 340 },
        { user: 6, text: "My toddler closed my unsaved 3-hour Figma file. I laughed instead of cried.", m: 320 },
        { user: 2, text: "Reviewed a PR 6 times in one day. We still shipped bugs. They're still apologizing 😂", m: 300 },
        { user: 5, text: "Won a hackathon with a prototype held together by duct tape and hope.", m: 280 },
      ],
    },
    {
      user: 2,
      category: "tips",
      title: "What's the best tool stack for solo founders after the AI shift?",
      content:
        "With the new AI coding assistants, I'm thinking the old solo stack is dead. Currently testing: Cursor + Supabase + Vercel + Linear. It feels strong for speed but weak for complex architecture where you need deep understanding. What are you running this year and why?",
      m: 250,
      likes: 19,
      replies: [
        { user: 1, text: "Design-to-code workflow is back. Figma → Builder.io → deploy is a must.", m: 230 },
        { user: 3, text: "Depends on your product. Consumer = speed. B2B = reliability + docs.", m: 210 },
        { user: 0, text: "I run bare metal + managed DB for side projects and it's honestly underrated.", m: 190 },
      ],
    },
    {
      user: 6,
      category: "general",
      title: "Welcome to VYRON! Introduce yourself 🎉",
      content:
        "New home base for thoughtful conversations! Drop a comment: your name, what you do, what you're building, and what brought you here. Let's build this community into the most meaningful corner of the internet. ✨",
      m: 900,
      likes: 67,
      replies: [
        { user: 0, text: "Alex, SF. Product designer → founder. Building VYRON. Glad to be here!", m: 880 },
        { user: 7, text: "Emma, NYC. Teacher + curriculum designer. Mostly observing but learning fast 📚", m: 860 },
        { user: 2, text: "Marcus, Austin. Full-stack engineer. Here for the showcase events 🚀", m: 840 },
        { user: 3, text: "Priya, London. Creative strategist. Brand + systems. Let's connect 💫", m: 820 },
        { user: 5, text: "Maya, Tokyo. Researcher. Cognitive science + UX. Mostly lurking... mostly.", m: 800 },
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