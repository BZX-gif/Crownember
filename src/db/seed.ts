import "dotenv/config";
import { randomBytes } from "crypto";
import { asc, inArray, sql } from "drizzle-orm";
import { db } from "./index";
import {
  messages,
  replies,
  rooms,
  topics,
  topicLikes,
  users,
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
        name: "The Hall",
        description:
          "The main room. Everyone on VYRON, around the clock.",
        icon: "●",
        color: "#fafafa",
      },
      {
        slug: "guides",
        name: "Notebook",
        description:
          "Ideas, how-tos and things worth remembering.",
        icon: "✎",
        color: "#d4d4d8",
      },
      {
        slug: "vault",
        name: "The Vault",
        description:
          "Passcode-sealed inner circle. Voice notes burn the moment anyone leaves.",
        icon: "▨",
        color: "#a1a1aa",
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
        username: "maya.writes",
        passwordHash: botPass,
        bio: "Essayist in training. Collecting sentences.",
        avatarColor: "#e4e4e7",
        xp: 5400,
        likes: 96,
        lastSeenAt: minutesAgo(2),
      },
      {
        username: "kenji.wav",
        passwordHash: botPass,
        bio: "Making music at 2am. Headphones mandatory.",
        avatarColor: "#d4d4d8",
        xp: 3650,
        likes: 74,
        lastSeenAt: minutesAgo(7),
      },
      {
        username: "ario.codes",
        passwordHash: botPass,
        bio: "Building small tools for strangers on the internet.",
        avatarColor: "#a1a1aa",
        xp: 4120,
        likes: 61,
        lastSeenAt: minutesAgo(15),
      },
      {
        username: "noor.paints",
        passwordHash: botPass,
        bio: "Watercolours, mostly skies.",
        avatarColor: "#e4e4e7",
        xp: 2200,
        likes: 43,
        lastSeenAt: minutesAgo(1),
      },
      {
        username: "tessa.runs",
        passwordHash: botPass,
        bio: "Morning kilometres, evening words.",
        avatarColor: "#d4d4d8",
        xp: 1750,
        likes: 35,
        lastSeenAt: minutesAgo(30),
      },
      {
        username: "ivan.cooks",
        passwordHash: botPass,
        bio: "If you can read a recipe, you can cook. Fight me.",
        avatarColor: "#a1a1aa",
        xp: 940,
        likes: 22,
        lastSeenAt: minutesAgo(120),
      },
      {
        username: "sana.reads",
        passwordHash: botPass,
        bio: "Three books at once, always.",
        avatarColor: "#e4e4e7",
        xp: 620,
        likes: 18,
        lastSeenAt: minutesAgo(240),
      },
      {
        username: "leo.drifts",
        passwordHash: botPass,
        bio: "Camera on the strap, nowhere to be.",
        avatarColor: "#d4d4d8",
        xp: 180,
        likes: 9,
        lastSeenAt: minutesAgo(480),
      },
    ])
    .returning();

  // Bot accounts keep the community alive but are always marked as such.
  await db
    .update(users)
    .set({ isBot: true })
    .where(inArray(users.id, botRows.map((b) => b.id)));

  // Registration stays open by default: no seat cap is seeded and the
  // waitlist begins empty. The Vault gets NO default passcode — a founder
  // forges the first key in-app, so no secret is ever committed here.

  const chatSeed: Array<{ room: number; user: number; text: string; m: number }> = [
    // room 0 = The Hall, room 1 = Notebook (room 2 = The Vault stays silent)
    { room: 0, user: 0, text: "Morning from a rainy Karachi. What's the weather doing where you are?", m: 55 },
    { room: 0, user: 2, text: "Sunny in Lisbon. Writing unit tests on a balcony, living the dream", m: 50 },
    { room: 0, user: 1, text: "2am here. Finishing a track and it finally sounds right 🎧", m: 47 },
    { room: 0, user: 3, text: "Post it in Notebook when it's done, I want to hear", m: 41 },
    { room: 0, user: 4, text: "Just ran 8k before sunrise. The city at 5am belongs to runners", m: 36 },
    { room: 0, user: 5, text: "Attempting a 48-hour bread this weekend. See you on the other side", m: 30 },
    { room: 0, user: 6, text: "Currently in that dangerous middle of three books. Which one do I finish first", m: 28 },
    { room: 0, user: 7, text: "Whichever one is closest. That's the only honest answer", m: 22 },
    { room: 0, user: 1, text: "This room at night feels like a late shift at a nice café", m: 15 },
    { room: 0, user: 0, text: "New members: say hi, tell us your city, done. That's the whole ritual", m: 8 },
    { room: 1, user: 3, text: "Notebook idea: a thread where everyone shares one photo of wherever they live", m: 120 },
    { room: 1, user: 2, text: "Do it. I'll start with a rooftop and a very insistent seagull", m: 110 },
    { room: 1, user: 6, text: "How do you all keep reading consistently? I stall hard after page 60", m: 90 },
    { room: 1, user: 6, text: "Twenty pages a day, same hour, phone in another room. Boring and it works", m: 85 },
    { room: 1, user: 0, text: "Second the phone rule. Gravity is real", m: 80 },
    { room: 1, user: 4, text: "Any good recipes for someone who owns exactly one pan?", m: 60 },
    { room: 1, user: 5, text: "One pan is a lifestyle, not a limitation. Shakshuka tonight", m: 45 },
    { room: 1, user: 1, text: "Writing tip I stole: read your draft out loud once. Every clumsy sentence confesses", m: 200 },
    { room: 1, user: 0, text: "Backup tip week: export anything you'd cry about losing. Takes 5 minutes", m: 180 },
    { room: 1, user: 5, text: "Taste your food before you salt it at the table. Most kitchens season properly", m: 150 },
    { room: 1, user: 2, text: "Commit small, commit often. Future-you is a stranger; leave them notes", m: 130 },
    { room: 1, user: 3, text: "Watercolours: the paper matters more than the paint. Cotton paper, every time", m: 100 },
    { room: 1, user: 7, text: "Walk with your camera with no subject in mind. The subject finds you", m: 70 },
    { room: 1, user: 6, text: "Annotate as you read. Books forgive pencil", m: 40 },
    { room: 0, user: 0, text: "Weekend thread Saturday: everyone shares one small win from the week. Be there", m: 90 },
    { room: 0, user: 3, text: "Mine already happened — finished a painting I started in March", m: 85 },
    { room: 0, user: 2, text: "Mine: deleted 400 lines of code and the thing got better", m: 80 },
    { room: 0, user: 6, text: "Finished the longest book on my shelf. 800 pages. I am insufferable now", m: 60 },
    { room: 0, user: 1, text: "Sent the demo to a friend and they actually listened. Twice", m: 30 },
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
      user: 6,
      category: "general",
      title: "Welcome to VYRON — introduce yourself",
      content:
        "This is the front door. Drop a reply: your name or handle, your city, and one thing you care about. That's the whole ritual. The rest of the platform takes care of itself.",
      m: 900,
      likes: 67,
      replies: [
        { user: 0, text: "Maya, Karachi. Sentences. Glad to be early.", m: 880 },
        { user: 7, text: "Leo, Lisbon. Photography and getting lost on purpose.", m: 860 },
        { user: 2, text: "Ario, Porto. Software and espresso, in that order.", m: 840 },
        { user: 3, text: "Noor, Dubai. Skies in watercolour. This place is beautiful.", m: 820 },
        { user: 5, text: "Ivan, Lyon. Food, mostly mine, sometimes yours if you leave it.", m: 800 },
      ],
    },
    {
      user: 0,
      category: "ideas",
      title: "A thread of one photo from where you live",
      content:
        "Idea: everyone posts exactly one photo (or one vivid sentence, if images aren't your thing) that says something true about their city. No landmarks, no tourist shots — the version only locals know.",
      m: 150,
      likes: 31,
      replies: [
        { user: 3, text: "The sky right after the last prayer call, over the rooftops. That's mine.", m: 140 },
        { user: 4, text: "An empty running track at 5:12am, dew on lane one.", m: 120 },
        { user: 1, text: "The hum of the studio fridge at 2am. Not scenic, but it's home.", m: 100 },
        { user: 6, text: "A bookshop cat asleep on the philosophy shelf, as it should be.", m: 90 },
      ],
    },
    {
      user: 2,
      category: "ideas",
      title: "What's the smallest habit that changed the most for you?",
      content:
        "Not a 30-day challenge, not a system — one tiny thing you actually stuck with. Mine: reading my drafts out loud before sending. Every clumsy sentence confesses instantly.",
      m: 300,
      likes: 24,
      replies: [
        { user: 4, text: "Laying out running clothes the night before. Removes the whole negotiation.", m: 280 },
        { user: 7, text: "Charging my camera every evening. Ready things get used.", m: 260 },
        { user: 5, text: "Tasting before salting. Saved me from myself a hundred times.", m: 240 },
      ],
    },
    {
      user: 5,
      category: "connect",
      title: "Cooking club, inaugural thread: what did you make this week?",
      content:
        "Proposal: a weekly thread where we report one thing we cooked. Successes especially, failures welcome — failures teach more. I'll start: a shakshuka that was 90% triumph, 10% smoke alarm.",
      m: 500,
      likes: 45,
      replies: [
        { user: 1, text: "Instant noodles, elevated with an egg. It counts if you plate it.", m: 490 },
        { user: 6, text: "I baked bread and read at the same time. The bread forgave me.", m: 470 },
        { user: 3, text: "Made chai four times in one evening. Research.", m: 450 },
      ],
    },
    {
      user: 1,
      category: "events",
      title: "Listening circle — Saturday, share one song",
      content:
        "Every Saturday we each drop one song and one sentence about why. No genre rules, no snobbery. Last count we covered four continents in one thread. This week: something that sounds like your city at night.",
      m: 400,
      likes: 38,
      replies: [
        { user: 0, text: "In. Mine will have rain in it somewhere.", m: 380 },
        { user: 2, text: "Everything I pick sounds like a terminal prompt. Theme respected.", m: 350 },
        { user: 7, text: "Recording street sounds this week — sneaking one in as an answer.", m: 300 },
      ],
    },
    {
      user: 6,
      category: "off-topic",
      title: "The currently-reading pile: confess yours",
      content:
        "I am in the middle of three books and pretending this is a personality. One by the bed, one in the bag, one I only read when the others annoy me. Confess your pile.",
      m: 350,
      likes: 52,
      replies: [
        { user: 4, text: "Two. A novel and a training manual. Both judgemental.", m: 340 },
        { user: 0, text: "Four, plus an essay collection I treat like grazing land.", m: 320 },
        { user: 3, text: "One, monogamously. I am available for admiration.", m: 300 },
        { user: 5, text: "A cookbook, reread like a novel. It's the best genre.", m: 280 },
      ],
    },
    {
      user: 0,
      category: "announcements",
      title: "How VYRON works — read this once",
      content:
        "Three things worth knowing on day one. 1) The Feed is forever; rooms are not. 2) Public chat fades after 3 hours — say it in the moment or keep it in a topic. 3) The Vault is sealed by a passcode only members forge and share. Everything else is just conversation. Welcome.",
      m: 1000,
      likes: 78,
      replies: [
        { user: 2, text: "The 3-hour fade is the best feature here. Hot takes expire gracefully.", m: 950 },
        { user: 6, text: "Pinning this in my brain. Thanks for keeping it simple.", m: 920 },
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

    // A few random likes from bot users so the demo counts feel lived-in
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
    `Seeded: ${roomRows.length} rooms, ${botRows.length} members, ${totalMessages.rows[0]?.n} messages, ${totalTopics.rows[0]?.n} topics.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
