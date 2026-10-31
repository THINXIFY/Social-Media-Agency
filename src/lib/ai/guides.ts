/**
 * Search-landing content for the Content Studio tools (SEO-01).
 *
 * Each guide gives its tool page substance beyond the interactive form: a
 * direct answer to the main question, who it helps, how to use it, what can
 * be customised, example briefs, practical writing tips and FAQs. Everything
 * here must stay true whether or not generation is switched on — anything
 * that depends on availability is rendered separately from the live state.
 * Examples in `tips` are written by the SociVanta team, not generated.
 *
 * A tool without a guide has no independent value yet, so its page is
 * `noindex, follow` and left out of the sitemap (see `isIndexableTool`).
 */

export interface ToolGuide {
  /** <title> (absolute). */
  seoTitle: string;
  /** Meta description; the availability clause is appended by the page. */
  metaDescription: string;
  /** Keyword intent this page owns (documented in docs/seo; not rendered as a keyword list). */
  intent: { primary: string; supporting: string[] };
  whatIs: { q: string; a: string; more: string };
  whoFor: { who: string; why: string }[];
  steps: { title: string; body: string }[];
  options: { name: string; detail: string }[];
  /** Example briefs. `fill` holds the form values "Try this example" puts into the workspace (it never generates). */
  examples: { title: string; brief: string; youGet: string; fill: Record<string, string | string[]> }[];
  tips: { title: string; body: string; example?: string }[];
  faqs: { q: string; a: string }[];
  next: { toolId: string; text: string }[];
}

export const TOOL_GUIDES: Record<string, ToolGuide> = {
  "caption-generator": {
    seoTitle: "AI Caption Generator for Instagram, TikTok & More | SociVanta",
    metaDescription: "Describe your post, pick platforms and a tone, and get three distinct caption options per platform, plus hooks and calls to action to edit.",
    intent: { primary: "AI caption generator", supporting: ["Instagram caption generator", "TikTok caption generator", "Facebook caption generator", "social media caption generator", "free AI Instagram caption generator"] },
    whatIs: {
      q: "What is an AI caption generator?",
      a: "An AI caption generator turns a short description of your post into ready-to-edit caption drafts. You say what the post is about and where it's going; the tool writes several options in your chosen tone, shaped for how people read on each platform.",
      more: "It's a starting point, not an autopilot: you pick the option that sounds most like you, adjust the details only you know, and post it yourself.",
    },
    whoFor: [
      { who: "Small businesses", why: "Announce a product, an offer or an event without staring at a blank caption box." },
      { who: "Creators", why: "Try a few angles on the same post before choosing the one that fits your voice." },
      { who: "Social media managers", why: "Draft platform-specific versions of one message quickly, then refine them for each client." },
    ],
    steps: [
      { title: "Describe the post", body: "One or two sentences about what you're sharing — and, if you like, who it's for." },
      { title: "Choose platforms and tone", body: "Pick up to three platforms (Instagram, TikTok, LinkedIn and more) and a tone such as Friendly, Professional or Playful." },
      { title: "Pick, edit and copy", body: "Review three different caption options per platform, swap in a hook or call to action, edit anything, then copy it into your post." },
    ],
    options: [
      { name: "Platforms", detail: "Instagram, TikTok, YouTube, Facebook, X, LinkedIn, Pinterest and Threads — up to three per run, each written for that platform's conventions." },
      { name: "Tone", detail: "Friendly, Professional, Playful, Bold or Inspirational." },
      { name: "Audience", detail: "Optional: who the post is for, so wording and references fit them." },
    ],
    examples: [
      { title: "Café launch", brief: "Launching our autumn coffee menu — warm, cosy and a little playful. For local students and remote workers.", youGet: "Three Instagram captions with different angles (story-led, question-led, benefit-led), three TikTok captions in a shorter, punchier style, plus hooks and calls to action.", fill: { topic: "Launching our autumn coffee menu — warm, cosy and a little playful.", platforms: ["Instagram", "TikTok"], tone: "Playful", audience: "Local students and remote workers" } },
      { title: "B2B announcement", brief: "We've opened a second office in Manchester and we're hiring two designers.", youGet: "LinkedIn captions in a professional tone with clear line breaks and no hashtag clutter, plus a call to action pointing people to apply.", fill: { topic: "We've opened a second office in Manchester and we're hiring two designers.", platforms: ["LinkedIn"], tone: "Professional", audience: "" } },
    ],
    tips: [
      { title: "Lead with the hook", body: "Most feeds only show the first line or two before cutting off. Put the most interesting part first, then the detail.", example: "“Our oat latte just got a cinnamon upgrade.” works harder than “We are pleased to announce a new menu item.”" },
      { title: "Write for each platform", body: "Instagram captions can tell a short story; TikTok captions work best short, because the video does the talking; LinkedIn rewards clear, readable paragraphs." },
      { title: "End with one clear action", body: "Ask for a single next step — visit, comment, save or share — rather than several at once." },
    ],
    faqs: [
      { q: "How do I write better Instagram captions?", a: "Open with a hook that earns the tap on “more”, keep one idea per caption, write the way you speak to your audience, and finish with one clear call to action. Add a few relevant hashtags rather than many generic ones." },
      { q: "Will the captions sound like me?", a: "You choose the tone and can describe your audience, and you get three different options to pick from. Treat them as drafts: changing a few words to match how you actually talk makes the biggest difference." },
      { q: "Does it post to my accounts?", a: "No. SociVanta AI never connects to your social accounts and never posts anything. You copy the caption you want and publish it yourself." },
      { q: "Should I check the captions before posting?", a: "Yes. AI can misunderstand context and doesn't know facts about your business beyond your brief, so read every caption and correct prices, dates and claims before you post." },
    ],
    next: [
      { toolId: "hashtag-finder", text: "Add relevant tags to your caption with the Hashtag & Keyword Finder." },
      { toolId: "content-calendar", text: "Plan what to post next with the Content Calendar." },
    ],
  },

  "hashtag-finder": {
    seoTitle: "AI Hashtag Generator & Keyword Finder | SociVanta",
    metaDescription: "Hashtags grouped from broad to niche, plus search keywords for your topic and platforms. Relevance-based suggestions — no invented trend data.",
    intent: { primary: "AI hashtag generator", supporting: ["Instagram hashtag generator", "TikTok hashtag generator", "social media hashtag generator", "AI social media keyword generator"] },
    whatIs: {
      q: "How do AI hashtag suggestions work?",
      a: "You describe your topic and choose platforms. The tool suggests hashtags that are relevant to that topic, grouped from broad to niche, plus keywords — the plain phrases people might type into search.",
      more: "The suggestions are based on relevance to your topic, not live data. SociVanta doesn't show search volume, popularity or trend figures, because they would be guesses.",
    },
    whoFor: [
      { who: "Creators building a niche", why: "Find the smaller community tags where your posts are more likely to be seen by the right people." },
      { who: "Local businesses", why: "Mix general tags with specific ones that describe exactly what you offer." },
      { who: "Anyone writing for search", why: "Use the keyword list for captions, profile bios and video titles on platforms where people search." },
    ],
    steps: [
      { title: "Describe your topic", body: "Say what the post or account is about in a sentence, e.g. “Vegan meal prep for busy parents on a budget”." },
      { title: "Choose platforms", body: "Pick up to three platforms so suggestions suit how people use tags there." },
      { title: "Mix and copy", body: "Copy a single tag, a whole group or everything, and combine a few broad tags with more specific and niche ones." },
    ],
    options: [
      { name: "Three groups", detail: "Broad (wide, general tags), Specific (clearly about your topic) and Niche & community (smaller groups and interests)." },
      { name: "Keywords", detail: "Plain search phrases without the #, for captions, bios, titles and descriptions." },
      { name: "Platforms", detail: "Up to three per run, from Instagram, TikTok, YouTube, Facebook, X, LinkedIn, Pinterest and Threads." },
    ],
    examples: [
      { title: "Food creator", brief: "Vegan meal prep for busy parents on a budget.", youGet: "Broad tags about vegan food and meal prep, specific tags about budget and family meal prep, niche community tags, and keywords such as cheap vegan lunches.", fill: { topic: "Vegan meal prep for busy parents on a budget.", platforms: ["Instagram", "TikTok"] } },
      { title: "Bike repair shop", brief: "Independent bike repair and servicing in Leeds.", youGet: "General cycling tags, specific repair and servicing tags, local community tags, and keywords people might search for nearby.", fill: { topic: "Independent bike repair and servicing in Leeds.", platforms: ["Instagram", "Facebook"] } },
    ],
    tips: [
      { title: "Relevance beats quantity", body: "A handful of tags that genuinely describe the post is more useful than a long list of loosely related ones." },
      { title: "Check before you use a tag", body: "Platforms restrict some tags. Tap a tag on the platform to see what's posted there before adding it to your post." },
      { title: "Use keywords in your words", body: "On platforms people search, put the main keyword naturally in your caption or title — not just in hashtags." },
    ],
    faqs: [
      { q: "How many hashtags should I use?", a: "There's no fixed number that works everywhere. Use a few tags that clearly describe the post, follow each platform's current guidance, and drop any that aren't truly relevant." },
      { q: "Does SociVanta show hashtag popularity or trends?", a: "No. The suggestions are about relevance to your topic. SociVanta doesn't display search volume, popularity, competition or trending status, because it doesn't have real data for them." },
      { q: "What's the difference between hashtags and keywords?", a: "Hashtags group posts on a platform. Keywords are the plain phrases people type into search — useful in captions, video titles, bios and descriptions." },
    ],
    next: [
      { toolId: "caption-generator", text: "Write the caption to go with your tags using the Caption Generator." },
      { toolId: "post-ideas", text: "Need something to post first? Try the Post Ideas Generator." },
    ],
  },

  "post-ideas": {
    seoTitle: "AI Social Media Post Ideas Generator | SociVanta",
    metaDescription: "Six practical post ideas for your brand and goal, each with a category, format, hook and outline — for Instagram, TikTok, Facebook and more.",
    intent: { primary: "AI social media post ideas", supporting: ["Instagram post ideas generator", "social media content ideas generator", "AI content ideas for businesses"] },
    whatIs: {
      q: "Can AI create social media post ideas for a small business?",
      a: "Yes — as a starting point. Describe your business and what you want to achieve, and the Post Ideas Generator suggests six ideas across different categories and formats, each with a hook and a short outline to build the post from.",
      more: "The ideas are general: they don't know your past results or your customers the way you do, so pick the ones that fit and adapt them.",
    },
    whoFor: [
      { who: "Small business owners", why: "Get unstuck when you know you should post but don't know what about." },
      { who: "Creators", why: "Find fresh angles on your niche and vary your formats." },
      { who: "Marketers", why: "Brainstorm a balanced mix of educational, community and promotional posts." },
    ],
    steps: [
      { title: "Describe your brand", body: "What you do and who for, in a sentence or two." },
      { title: "Choose a goal and platforms", body: "For example Build a community or Drive website visits, on up to three platforms." },
      { title: "Filter and build", body: "Filter the ideas by category, copy the ones you like, and use the outline to create the post." },
    ],
    options: [
      { name: "Goal", detail: "Grow followers, More engagement, Drive website visits, Sell a product or Build a community." },
      { name: "Categories", detail: "Ideas span categories such as Educational, Behind the scenes, Community, Promotional, Entertaining, Inspirational and Social proof." },
      { name: "Formats", detail: "Carousel, short video, single image, story, text post, live or poll — matched to the platform." },
    ],
    examples: [
      { title: "Bike repair shop", brief: "An independent bike repair shop that wants more local regulars. Goal: build a community.", youGet: "Six ideas such as a quick repair tip video, a meet-the-mechanic carousel and a customer ride feature, each with a hook and outline.", fill: { brand: "An independent bike repair shop that wants more local regulars.", goal: "Build a community", platforms: ["Instagram", "Facebook"] } },
      { title: "Skincare brand", brief: "A new skincare brand for sensitive skin. Goal: grow followers.", youGet: "A mix of educational posts about ingredients, behind-the-scenes content and community questions, in formats suited to TikTok and Instagram.", fill: { brand: "A new skincare brand for sensitive skin.", goal: "Grow followers", platforms: ["TikTok", "Instagram"] } },
    ],
    tips: [
      { title: "Balance your mix", body: "If every post sells, people tune out. Mix helpful and behind-the-scenes posts with occasional promotions." },
      { title: "Reuse a good idea", body: "One strong idea can become a carousel, a short video and a story — adapted to each format." },
      { title: "Be specific", body: "“Three signs your brakes need servicing” is easier to make and more useful than “Bike safety tips”." },
    ],
    faqs: [
      { q: "How do I come up with social media content ideas?", a: "Start from what your audience asks you, what happens behind the scenes, and what you can teach. Then vary the format — the same idea can be a carousel, a short video or a poll." },
      { q: "Are the ideas tailored to my business?", a: "They're based on the description and goal you give. The more specific your brief, the more specific the ideas — but they don't know your past results, so choose and adapt them." },
      { q: "Does it create the images or videos?", a: "No. SociVanta AI suggests ideas, hooks and outlines in text. You create the visuals yourself." },
    ],
    next: [
      { toolId: "content-calendar", text: "Turn ideas into a weekly plan with the Content Calendar." },
      { toolId: "caption-generator", text: "Write the caption for your chosen idea with the Caption Generator." },
    ],
  },

  "content-calendar": {
    seoTitle: "AI Social Media Content Calendar Generator | SociVanta",
    metaDescription: "Plan 7 or 30 days of posts: weekly themes plus a day-by-day plan you can edit, copy, export as CSV or print. Nothing is posted for you.",
    intent: { primary: "social media content calendar generator", supporting: ["AI content calendar generator", "free social media content planner", "Instagram content calendar"] },
    whatIs: {
      q: "What is a social media content calendar?",
      a: "A social media content calendar is a plan of what you'll post, where and when — usually organised by week, with a theme and a list of posts. It helps you post consistently and keep a healthy mix of content.",
      more: "The Content Calendar drafts that plan for you: weekly themes and a day-by-day list with the platform, format and topic of each post. Days are numbered, not dated, and nothing is scheduled or published.",
    },
    whoFor: [
      { who: "Busy business owners", why: "Decide a week or a month of posts in one sitting instead of every morning." },
      { who: "Creators", why: "Keep a steady rhythm and avoid repeating the same type of post." },
      { who: "Small teams", why: "Share a printable or spreadsheet plan everyone can follow." },
    ],
    steps: [
      { title: "Describe your brand and goal", body: "What you do and what you want from social media." },
      { title: "Set your rhythm", body: "Choose platforms, how many posts per week (1–14) and a 7- or 30-day plan." },
      { title: "Edit and export", body: "Adjust themes, topics and notes, then copy the plan, export a CSV for your spreadsheet, or print it." },
    ],
    options: [
      { name: "Plan length", detail: "7 days, or 30 days planned one week at a time so each week has its own theme." },
      { name: "Posts per week", detail: "From 1 to 14, spread sensibly across the days and your chosen platforms." },
      { name: "Export", detail: "Copy as text, download a CSV that opens in spreadsheet apps, or print a clean version." },
    ],
    examples: [
      { title: "New skincare brand", brief: "A new skincare brand for sensitive skin, posting three times a week on TikTok and Instagram for a month.", youGet: "Five weekly themes and around a dozen posts with a format and topic for each, ready to edit and export.", fill: { brand: "A new skincare brand for sensitive skin.", goal: "Grow followers", platforms: ["TikTok", "Instagram"], frequency: "3", days: "30" } },
      { title: "Local café", brief: "A café posting twice a week on Instagram for the next week.", youGet: "One weekly theme and two planned posts, each with a practical note.", fill: { brand: "A neighbourhood café with homemade cakes and a quiet upstairs room.", goal: "More engagement", platforms: ["Instagram"], frequency: "2", days: "7" } },
    ],
    tips: [
      { title: "Plan themes, not just posts", body: "A weekly theme gives your posts a thread to follow and makes them easier to write." },
      { title: "Choose a rhythm you can keep", body: "Posting consistently at a sustainable pace usually beats bursts followed by silence." },
      { title: "Leave room for the moment", body: "Keep one slot a week flexible for news, trends or customer questions." },
    ],
    faqs: [
      { q: "How can AI help plan social media content?", a: "It can draft the structure — themes, a posting rhythm and topics for each slot — in seconds, so you spend your time improving and creating the posts instead of deciding what they should be." },
      { q: "Does the calendar schedule or publish posts?", a: "No. It's a plan you can edit, copy, export or print. SociVanta AI never connects to your accounts or posts anything." },
      { q: "What's the best time to post?", a: "It depends on your audience. The calendar deliberately doesn't suggest posting times — check your own platform insights to see when your followers are active." },
      { q: "Can I open the plan in a spreadsheet?", a: "Yes. Export the plan as a CSV file, which opens in common spreadsheet apps." },
    ],
    next: [
      { toolId: "post-ideas", text: "Fill a slot with fresh ideas from the Post Ideas Generator." },
      { toolId: "caption-generator", text: "Write each post's caption with the Caption Generator." },
    ],
  },
  "growth-advisor": {
    seoTitle: "AI Social Media Growth Advisor & Strategy | SociVanta",
    metaDescription: "Describe your business, goal and challenge to get an honest assessment, 3–5 prioritised recommendations, quick wins and what to measure.",
    intent: { primary: "AI social media growth advisor", supporting: ["AI social media marketing strategy", "social media growth strategy generator", "social media strategy for small business"] },
    whatIs: {
      q: "What does an AI social media growth advisor do?",
      a: "It turns a short description of your business, goal and current challenge into a prioritised strategy: what's holding you back, where the opportunities are, three to five recommendations with practical steps, quick wins and what to measure.",
      more: "It works only from what you tell it — it can't see your accounts or results — so it lists the assumptions it made. Treat the strategy as a structured starting point to test, not a prediction.",
    },
    whoFor: [
      { who: "Small business owners", why: "Get a clear plan without hiring an agency or learning marketing jargon." },
      { who: "Creators", why: "Work out why growth has stalled and what to change first." },
      { who: "Marketers and agencies", why: "Draft a structured first strategy for a client to refine together." },
    ],
    steps: [
      { title: "Describe the challenge", body: "In a sentence or two, say what's getting in the way — for example low engagement or not knowing what to post." },
      { title: "Add your context", body: "Choose your business type, niche, main platform and goal. Budget and experience are optional." },
      { title: "Work through the strategy", body: "Start with the high-priority recommendations and quick wins, then use the measures to check what's working." },
    ],
    options: [
      { name: "Goal", detail: "Grow followers, More engagement, Get more leads, Drive website visits, Sell more products, Build a community or Launch something new." },
      { name: "Business type and niche", detail: "From small businesses and creators to online stores, SaaS, agencies and nonprofits." },
      { name: "Budget and experience", detail: "Optional. With no budget, the advice sticks to organic tactics; beginners get simpler steps." },
      { name: "Website or profile link", detail: "Optional context only. SociVanta never visits or reads the link." },
    ],
    examples: [
      { title: "Local restaurant", brief: "", youGet: "An assessment of what limits local reach, recommendations such as a weekly behind-the-scenes series and local partnerships, quick wins for this week and what to measure.", fill: { challenge: "We're a family Italian restaurant. Our Instagram posts get a few likes but we don't see new local customers coming from it.", businessType: "Small business", niche: "Family Italian restaurant in Bristol", platform: "Instagram", goal: "Get more leads", audience: "Local families and couples" } },
      { title: "Clothing brand", brief: "", youGet: "Prioritised recommendations for turning views into store visits, content formats to test on TikTok, and how to measure which posts drive traffic.", fill: { challenge: "Our TikTok videos get views but almost nobody visits our online store afterwards.", businessType: "Online store", niche: "Sustainable streetwear brand", platform: "TikTok", goal: "Drive website visits", audience: "18–30 year olds who care about sustainability" } },
    ],
    tips: [
      { title: "Be specific about the problem", body: "“Posts get likes but no enquiries” leads to far more useful advice than “we need to grow”." },
      { title: "Do one recommendation properly", body: "Pick the top recommendation and run it for a few weeks before adding the next. Spreading effort thin makes it hard to tell what worked." },
      { title: "Measure before you change", body: "Note where you are on the suggested measures today, so you can compare honestly later." },
    ],
    faqs: [
      { q: "How can AI help with a social media marketing strategy?", a: "It can quickly structure your situation into priorities, practical steps and things to measure — the planning work that's easy to skip. The judgement is still yours: you know your customers, so adapt what doesn't fit." },
      { q: "Does the advisor look at my accounts or analytics?", a: "No. It never connects to your accounts and can't see your results. It works only from your brief and tells you what it assumed. It also won't invent statistics about your audience." },
      { q: "Will following the strategy guarantee growth?", a: "No tool can guarantee results. The recommendations are practical starting points; test them, measure what happens and keep what works." },
      { q: "Is my information stored?", a: "SociVanta doesn't store your brief or the strategy. Personal details like email addresses and phone numbers are removed before anything reaches the AI model." },
    ],
    next: [
      { toolId: "growth-roadmap", text: "Turn the strategy into a 7, 30 or 90-day plan with the Growth Roadmap." },
      { toolId: "post-ideas", text: "Get specific post ideas for your recommendations with the Post Ideas Generator." },
    ],
  },

  "growth-roadmap": {
    seoTitle: "AI Social Media Growth Plan: 7, 30 & 90-Day Roadmaps | SociVanta",
    metaDescription: "A realistic 7, 30 or 90-day social media growth plan: prioritised tasks, milestones, checkpoints and what to measure, sized to your time.",
    intent: { primary: "AI social media growth plan", supporting: ["social media marketing roadmap", "30-day social media growth plan", "90-day social media plan"] },
    whatIs: {
      q: "What is a social media growth roadmap?",
      a: "A growth roadmap breaks a goal into stages — days, weeks or months — each with a clear milestone, prioritised tasks, content activities and a checkpoint to review progress. It turns “grow on Instagram” into what to do first, next and after that.",
      more: "The Growth Roadmap sizes each stage to the time you say you have, builds later stages on earlier ones, and suggests what to measure rather than promising numbers.",
    },
    whoFor: [
      { who: "Busy owners", why: "Know exactly what to do each week with the few hours you have." },
      { who: "Creators starting out", why: "Follow a clear 30-day plan instead of guessing every day." },
      { who: "Teams", why: "Share a printable plan with milestones and review points everyone can follow." },
    ],
    steps: [
      { title: "Describe your business", body: "What you do and who you serve, in a sentence or two." },
      { title: "Set objective, time and length", body: "Choose your main objective, how much time you can give it each week, and a 7, 30 or 90-day plan." },
      { title: "Follow and review", body: "Work through each stage's high-priority tasks, then use the checkpoint to decide what to adjust." },
    ],
    options: [
      { name: "Plan length", detail: "7 days of daily actions, 30 days of weekly milestones, or 90 days in monthly phases with weekly milestones." },
      { name: "Time available", detail: "From 1–2 hours a week to 10+, so the plan stays realistic." },
      { name: "Challenge, experience and budget", detail: "Optional details that make the plan more specific to you." },
    ],
    examples: [
      { title: "Online candle shop, 30 days", brief: "", youGet: "Four weekly stages — from fixing your profile and content pillars to a launch push — each with tasks, content activities and a checkpoint.", fill: { niche: "A handmade candle brand selling online, mostly to repeat customers.", platform: "Instagram", objective: "Sell more products", time: "3–5 hours a week", duration: "30" } },
      { title: "SaaS startup, 90 days", brief: "", youGet: "Three monthly phases with weekly milestones: positioning and proof first, then a steady content engine, then lead generation, with indicators to watch.", fill: { niche: "A small SaaS startup with a scheduling app for hair salons.", platform: "LinkedIn", objective: "Get more leads", time: "5–10 hours a week", duration: "90", experience: "Some experience" } },
    ],
    tips: [
      { title: "Choose a length you'll finish", body: "A 7-day plan you complete teaches you more than a 90-day plan you abandon in week two." },
      { title: "Protect the checkpoints", body: "Put each review in your calendar. The checkpoint is where the plan becomes yours." },
      { title: "Keep tasks small", body: "If a task takes more than an afternoon, split it. Momentum matters more than ambition." },
    ],
    faqs: [
      { q: "What should a 30-day social media growth plan include?", a: "A clear objective, four weekly milestones, a few prioritised tasks per week, the content you'll make, and a short review at the end of each week to decide what to keep." },
      { q: "Can I make a 90-day social media plan?", a: "Yes. Choose 90 days to get three monthly phases, each with weekly milestones, tasks, dependencies and a review checkpoint. Each month builds on the one before." },
      { q: "Does the roadmap schedule or post anything?", a: "No. It's a plan you can read, copy, download or print. SociVanta never connects to your accounts or posts for you." },
      { q: "Can I save my roadmap?", a: "Copy it, download it as a Markdown file or print it. SociVanta doesn't store plans, so keep your own copy." },
    ],
    next: [
      { toolId: "content-calendar", text: "Turn this plan's content activities into a posting calendar." },
      { toolId: "growth-advisor", text: "Not sure what to focus on? Start with the Growth Advisor." },
    ],
  },

  "service-recommender": {
    seoTitle: "Find Social Media Marketing Services with AI | SociVanta",
    metaDescription: "Describe your goal and platform to see which SociVanta services fit and why. Prices and availability come from the catalog, never the AI.",
    intent: { primary: "find social media marketing services", supporting: ["social media marketing service finder", "AI marketing service recommendations"] },
    whatIs: {
      q: "How does the AI Service Recommender choose services?",
      a: "You describe your goal and platform. SociVanta looks up matching services in its own catalog, the AI ranks the relevant ones and explains why each fits, and SociVanta checks every recommendation against the catalog before showing it.",
      more: "Names, prices and availability always come from SociVanta, not the AI. A service can only be ordered when it has passed every review and ordering is open — otherwise it's clearly marked as not available to order.",
    },
    whoFor: [
      { who: "First-time customers", why: "Find the right kind of service without learning every option in the catalog." },
      { who: "Businesses with a specific goal", why: "See which services support that goal — and which won't help." },
      { who: "Anyone comparing options", why: "Get a short, explained shortlist instead of scrolling the full catalog." },
    ],
    steps: [
      { title: "Describe your goal", body: "For example “more people watching our new YouTube tutorials”." },
      { title: "Choose the platform", body: "Optionally narrow it to the kind of help you want, such as views or engagement." },
      { title: "Review the shortlist", body: "Read why each service fits and its limitations. Orderable services link to the usual New Order flow, where you review everything before paying." },
    ],
    options: [
      { name: "Platform", detail: "Any platform in the SociVanta catalog, from Instagram and TikTok to Telegram and website promotion." },
      { name: "Kind of help", detail: "Optional: Audience, Engagement, Views or Advertising." },
      { name: "Budget", detail: "Optional context for the guidance. Prices shown are always SociVanta's listed prices." },
    ],
    examples: [
      { title: "YouTube tutorials", brief: "", youGet: "Relevant views and audience services for YouTube from the catalog, why each could help, honest limitations, and guidance that doesn't require buying anything.", fill: { goal: "More people watching our new YouTube tutorial series, and a few more subscribers.", platform: "youtube", focus: "Views" } },
      { title: "Agency launching a client", brief: "", youGet: "A shortlist of Instagram services that may support a launch, each marked as orderable or not, plus practical launch guidance.", fill: { goal: "We're an agency launching a new beauty client's Instagram and want early engagement on launch posts.", platform: "instagram", focus: "Engagement" } },
    ],
    tips: [
      { title: "Services support a strategy", body: "Paid services work best alongside good content and a clear goal — not as a replacement for them." },
      { title: "Read the limitations", body: "Each recommendation says what it won't do. Use that to set honest expectations." },
      { title: "Check before you order", body: "The New Order flow shows the final price and requirements. Nothing is ordered until you confirm." },
    ],
    faqs: [
      { q: "Can the AI recommend services SociVanta doesn't offer?", a: "No. The AI can only choose from services SociVanta looked up in its own catalog, and every pick is checked against that list before you see it." },
      { q: "Are the prices accurate?", a: "Prices come directly from SociVanta's catalog, not from the AI. A price is shown only for services that can actually be ordered." },
      { q: "Will it place an order for me?", a: "No. The recommender never orders, charges your wallet or changes anything. Orderable services link to the normal New Order flow, where you review and confirm yourself." },
      { q: "What if nothing fits?", a: "You'll see “No eligible services currently match your goal” with practical guidance you can use without buying anything." },
    ],
    next: [
      { toolId: "growth-advisor", text: "Get a full strategy for your goal with the Growth Advisor." },
      { toolId: "growth-roadmap", text: "Plan the weeks around your services with the Growth Roadmap." },
    ],
  },
  assistant: {
    seoTitle: "SociVanta AI Assistant: AI Social Media Marketing Help",
    metaDescription: "Ask about SociVanta's services, how ordering works and which AI tool fits your task — or get practical social media marketing answers.",
    intent: { primary: "AI social media assistant", supporting: ["AI marketing assistant", "social media marketing AI assistant"] },
    whatIs: {
      q: "What can the SociVanta AI Assistant help with?",
      a: "It answers questions about SociVanta — what it offers, how services and orders work, what a service needs from you and which AI tool fits your task — and gives practical answers to everyday social media marketing questions.",
      more: "For anything about SociVanta it uses SociVanta's own verified information, including live catalog details, and says so when it doesn't know. It can't see your orders, balance or account, and it never takes actions for you.",
    },
    whoFor: [
      { who: "New customers", why: "Understand how SociVanta works before you order — in plain words." },
      { who: "Busy business owners", why: "Get a quick, practical answer instead of reading every page." },
      { who: "Anyone choosing a tool", why: "Find out which SociVanta AI tool fits what you're trying to do." },
    ],
    steps: [
      { title: "Ask in your own words", body: "Type a question or pick a suggested one — for example “How do orders work?”." },
      { title: "Read a short answer", body: "Answers are brief and practical, with links to the right SociVanta page when it helps." },
      { title: "Keep going or jump in", body: "Ask a follow-up, or open Smart Service Search when you're ready to find services." },
    ],
    options: [
      { name: "SociVanta questions", detail: "Services and platforms, ordering, paying, order statuses, AI tools, accounts and support." },
      { name: "Marketing questions", detail: "Practical social media advice, without invented statistics or guarantees." },
      { name: "Next steps", detail: "Links to the right page and, when you're looking for services, a one-click route to Smart Service Search." },
    ],
    examples: [
      { title: "Understanding orders", brief: "", youGet: "A short explanation of how New Order works, what a service asks for, and whether ordering is open right now.", fill: { message: "How do orders work, and what will a service ask me for?" } },
      { title: "Choosing an AI tool", brief: "", youGet: "Which SociVanta AI tools fit planning a month of posts, with links to each.", fill: { message: "Which AI tool should I use to plan a month of Instagram posts?" } },
    ],
    tips: [
      { title: "Ask one thing at a time", body: "Short, specific questions get the clearest answers. Follow up to go deeper." },
      { title: "Use the links", body: "When the assistant points to a page, that's where the full, up-to-date details live." },
      { title: "Check your own account in the dashboard", body: "The assistant can't see your orders or balance — My orders and Add funds show them." },
    ],
    faqs: [
      { q: "Is the assistant a real person?", a: "No. It's an automated AI guide. For support questions, the AI Support Assistant explains your options — including how to reach a person, or that no contact channel is connected yet." },
      { q: "Can it check my order or my balance?", a: "No. The assistant can't see or change your orders, balance, deposits or account details. For one of your orders, open it in My orders and choose Explain this order." },
      { q: "Where do its answers come from?", a: "For SociVanta questions it uses SociVanta's own verified information, including live catalog details. If something isn't covered, it says it doesn't know rather than guessing." },
      { q: "Are my conversations saved?", a: "No. The conversation lasts only while the page is open. Personal details are removed before anything reaches the AI model." },
    ],
    next: [
      { toolId: "service-search", text: "Ready to look for services? Describe what you need in Smart Service Search." },
      { toolId: "growth-advisor", text: "Want a full plan? Get a prioritised strategy from the Growth Advisor." },
    ],
  },

  "service-search": {
    seoTitle: "AI Social Media Service Finder: Search in Plain Words | SociVanta",
    metaDescription: "Describe what you need, like promoting a clothing store on Instagram, and see matching SociVanta services with why each fits.",
    intent: { primary: "AI social media service finder", supporting: ["social media marketing service search", "search social media services"] },
    whatIs: {
      q: "How does AI-powered service search work?",
      a: "You describe what you need in everyday words. SociVanta works out the platform and the kind of help you want, looks up matching services in its own catalog, and AI ranks the relevant ones and explains why each fits.",
      more: "Every result is a real SociVanta service, checked against the catalog before you see it. Names, prices and availability come from SociVanta, never from the AI — and keyword search works without AI at all.",
    },
    whoFor: [
      { who: "First-time customers", why: "Find the right service without knowing the catalog's categories." },
      { who: "Busy owners", why: "Say what you want — “more views for my YouTube channel” — and skip the browsing." },
      { who: "Anyone comparing", why: "See best matches and alternatives side by side, each with a reason." },
    ],
    steps: [
      { title: "Describe what you need", body: "For example “I want to promote my clothing store on Instagram”. Add a platform if you like." },
      { title: "Review the matches", body: "Best matches come first, then alternatives. Open View service for what an order asks for." },
      { title: "Order when you're ready", body: "Services that can be ordered link to New Order, where you review everything before paying." },
    ],
    options: [
      { name: "AI match", detail: "Understands everyday language and explains each match. Free with a verified account, within the daily allowance." },
      { name: "Keyword match", detail: "Finds services by platform and need words — no AI, no account needed." },
      { name: "Platform filter", detail: "Optional. Narrow the search to one of the 15 platforms in the catalog." },
    ],
    examples: [
      { title: "Clothing store", brief: "", youGet: "Instagram services that can support promoting a store, best matches first, each with why it fits and whether it can be ordered.", fill: { query: "I want to promote my clothing store on Instagram", platform: "instagram" } },
      { title: "YouTube channel", brief: "", youGet: "YouTube views and audience services from the catalog, with plain reasons and verified availability.", fill: { query: "I need services for promoting my YouTube channel", platform: "youtube" } },
    ],
    tips: [
      { title: "Name the platform and the goal", body: "“More followers on TikTok” finds better matches than “help my business”." },
      { title: "Open the details", body: "View service shows what an order needs — such as a link and a quantity — before you decide." },
      { title: "Searching is free of commitment", body: "Nothing is ordered or charged from search. You always confirm in New Order." },
    ],
    faqs: [
      { q: "Does the search show real services?", a: "Yes. Every result comes from SociVanta's catalog and is checked against it before you see it. The AI can't add services that don't exist." },
      { q: "Are the prices accurate?", a: "Prices come straight from SociVanta's catalog and appear only for services that can actually be ordered. There are no match scores or invented figures." },
      { q: "Can I search without AI?", a: "Yes. Keyword search matches services by platform and need words with no AI, and doesn't need an account." },
      { q: "What's the difference between Service Search and the Service Recommender?", a: "Service Search is for quickly finding services from a plain description. The Service Recommender takes a business goal and explains a short, reasoned shortlist with guidance." },
    ],
    next: [
      { toolId: "service-recommender", text: "Prefer a reasoned shortlist for a goal? Try the Service Recommender." },
      { toolId: "assistant", text: "Have questions first? Ask the SociVanta AI Assistant." },
    ],
  },
  "order-assistant": {
    seoTitle: "Smart Order Assistant: Set Up Social Media Orders | SociVanta",
    metaDescription: "Describe your goal and get one matching SociVanta service, a quantity within its limits and a setup checklist, ready to review in New Order.",
    intent: { primary: "social media order assistant", supporting: ["how to order social media services", "choose a social media service quantity"] },
    whatIs: {
      q: "What does the Smart Order Assistant do?",
      a: "It helps you set up an order correctly before you place it. You describe what you want to achieve; it picks one matching service from SociVanta's catalog, suggests a quantity within that service's limits, and explains each detail the order will ask for.",
      more: "It prepares a draft, not an order. “Continue in New Order” opens the normal four-step New Order flow with the service and quantity filled in, and you add the rest, review the price and confirm yourself. Services, limits and prices always come from SociVanta's catalog.",
    },
    whoFor: [
      { who: "First-time customers", why: "Know which service fits and what to enter before you start an order." },
      { who: "Busy owners", why: "Go from a goal — “more followers for my bakery” — to a ready-to-review draft." },
      { who: "Careful buyers", why: "Check quantity limits and order requirements up front, so nothing gets sent back for missing details." },
    ],
    steps: [
      { title: "Describe your goal", body: "For example “More followers for my new Instagram bakery account”. Add a platform or a quantity if you have one in mind." },
      { title: "Review the plan", body: "See the recommended service, a quantity within its limits, what the order will ask for and a few checks before ordering." },
      { title: "Continue in New Order", body: "When the service can be ordered, open the draft in New Order, add the remaining details, review the price and confirm." },
    ],
    options: [
      { name: "Goal", detail: "What you want to achieve, in your own words." },
      { name: "Platform", detail: "Optional. Narrow the choice to one of the 15 platforms in the catalog." },
      { name: "Quantity", detail: "Optional. Checked against the service's own minimum and maximum before it goes into the draft." },
    ],
    examples: [
      { title: "New Instagram shop", brief: "", youGet: "One Instagram audience service, a starting quantity inside its limits, and what the order needs — such as a public profile link.", fill: { goal: "More followers for my new Instagram bakery account", platform: "instagram", quantity: "" } },
      { title: "YouTube launch", brief: "", youGet: "A YouTube views service for a new video, a quantity checked against its limits, and tips for getting the link right.", fill: { goal: "Views for the first video on my new YouTube cooking channel", platform: "youtube", quantity: "" } },
    ],
    tips: [
      { title: "Say what you want more of", body: "Followers, views, likes, comments or promotion — naming it gets a closer match than “help my account”." },
      { title: "Make the target public", body: "Most services need a public profile or post link. Never share a password or login code — no SociVanta order asks for one." },
      { title: "Review before confirming", body: "The draft fills in the service and quantity only. Check every detail and the total on the Review step." },
    ],
    faqs: [
      { q: "Does the Smart Order Assistant place orders?", a: "No. It prepares a draft and opens New Order with the service and quantity filled in. Nothing is ordered, reserved or charged until you confirm there yourself." },
      { q: "Where do the services and prices come from?", a: "From SociVanta's catalog. The AI picks among real catalog services, and the server checks its choice. Prices appear only for services that can actually be ordered." },
      { q: "How is the quantity chosen?", a: "If you enter one, it's checked against the service's limits. Otherwise the assistant may suggest a starting quantity, which is used only if it's within those limits. You can change it in New Order." },
      { q: "Why can't I open the draft in New Order?", a: "The link appears only when the service can be ordered and ordering is open. Otherwise the plan still shows what the service needs, so you're ready when it is." },
    ],
    next: [
      { toolId: "service-search", text: "Want to compare several services first? Use Smart Service Search." },
      { toolId: "order-explanation", text: "Already ordered? Get a plain-language explanation of where it stands." },
    ],
  },

  "order-explanation": {
    seoTitle: "AI Order Explanation: Your Order Status in Plain Words",
    metaDescription: "Choose one of your SociVanta orders and see what its status and payment mean and what you can do next, from what's recorded on it.",
    intent: { primary: "order status explained", supporting: ["what does my order status mean", "track social media order status"] },
    whatIs: {
      q: "What does AI Order Explanation tell me?",
      a: "It explains one of your orders in plain words: where it stands, what its status and payment state mean for you, and what you can do now — for example update details the team asked for, or cancel while work hasn't started.",
      more: "It uses only what's recorded on your order. It never estimates delivery dates, progress or refunds, and it can't change the order. The recorded timeline and its real times are shown beside the explanation.",
    },
    whoFor: [
      { who: "Customers waiting on an order", why: "Understand what “Awaiting review” or “In progress” means right now." },
      { who: "Anyone asked for information", why: "See exactly what the team needs and where to update it." },
      { who: "Customers checking a payment", why: "Know whether the total is held, returned to your wallet or under refund review." },
    ],
    steps: [
      { title: "Choose an order", body: "Open an order in My orders and choose Explain this order, or pick one of your recent orders on this page." },
      { title: "Ask, if you like", body: "Add a question such as “What happens next?” — or just get the explanation." },
      { title: "Act from My orders", body: "Any action the order allows — like updating details or canceling — stays in the order's panel, under your control." },
    ],
    options: [
      { name: "Your orders only", detail: "The order is looked up under your signed-in account. Other customers' orders can't be read." },
      { name: "Optional question", detail: "Ask about this order in your own words; answers come only from its record." },
      { name: "Recorded timeline", detail: "Every recorded step with its real time, straight from the order — not from the AI." },
    ],
    examples: [
      { title: "Waiting for review", brief: "", youGet: "What “Awaiting review” means, that the total is held for the order, and that you can still cancel for the full amount back.", fill: { reference: "", question: "What happens next with this order?" } },
      { title: "Information needed", brief: "", youGet: "What the team asked for, where to update the details, and what happens after you do.", fill: { reference: "", question: "Why does it say my information is needed?" } },
    ],
    tips: [
      { title: "Start from My orders", body: "Explain this order sits inside each order's panel, next to the actions it allows." },
      { title: "Read the team's message", body: "When the team needs something, their message is shown with the order. The explanation refers to it, never rewrites it." },
      { title: "Expect no estimates", body: "SociVanta doesn't record delivery estimates, so neither the order nor the explanation will give one." },
    ],
    faqs: [
      { q: "Can AI Order Explanation see other people's orders?", a: "No. It reads one order, looked up under your own signed-in account. Any other reference is treated as not found." },
      { q: "Will it tell me when my order will be delivered?", a: "No. SociVanta doesn't record delivery estimates, and the explanation never guesses dates, speeds or progress. It explains the status that is recorded." },
      { q: "Can it cancel or refund my order?", a: "No. It's read-only. If the order can still be canceled, it tells you so, and you cancel from the order's panel in My orders." },
      { q: "What does it use to explain my order?", a: "The order's recorded status, payment state, timeline and the team's messages to you. Not your target link, submitted details or anything internal to SociVanta." },
    ],
    next: [
      { toolId: "support-assistant", text: "Need more help? Ask the AI Support Assistant." },
      { toolId: "order-assistant", text: "Planning another order? Set it up with the Smart Order Assistant." },
    ],
  },

  "support-assistant": {
    seoTitle: "AI Support Assistant: Help With Orders & Payments | SociVanta",
    metaDescription: "Get clear answers about orders, payments, cancellations, refunds and your account, and an honest path to a person when only the team can help.",
    intent: { primary: "SociVanta customer support", supporting: ["social media order help", "cancel social media order", "refund social media service"] },
    whatIs: {
      q: "What can the AI Support Assistant help with?",
      a: "It answers support questions — how cancellations and refunds work, what order statuses mean, how wallet funds and payments work, and how to keep your account secure — from SociVanta's verified help information.",
      more: "When only the SociVanta team can help, it says so and shows exactly how to reach a person, or tells you plainly that no contact channel is connected yet. It never pretends a ticket was opened or a message was sent.",
    },
    whoFor: [
      { who: "Customers with a question", why: "Get an answer now instead of waiting for a reply." },
      { who: "Customers with a problem", why: "Find out whether you can fix it yourself — like canceling before work starts — or need the team." },
      { who: "New customers", why: "Understand payments, statuses and cancellations before you order." },
    ],
    steps: [
      { title: "Describe what you need", body: "In your own words — for example “How do I cancel an order?”." },
      { title: "Follow the answer", body: "Short steps with links to the right page in your dashboard." },
      { title: "Reach a person if needed", body: "When the team is needed, the assistant shows the real way to reach them — or that none is connected yet." },
    ],
    options: [
      { name: "Orders & statuses", detail: "What each status means, updating details and canceling while work hasn't started." },
      { name: "Payments & refunds", detail: "Wallet funds, deposits, and when a refund needs a reviewed decision." },
      { name: "Account & security", detail: "Email verification, passwords and account protection." },
    ],
    examples: [
      { title: "Canceling", brief: "", youGet: "When you can cancel an order yourself, where to do it, and what happens to the money.", fill: { message: "Can I still cancel an order after work has started?" } },
      { title: "Something's wrong", brief: "", youGet: "What you can check yourself, and how to reach the SociVanta team if a person is needed.", fill: { message: "I think something is wrong with my order. What should I do?" } },
    ],
    tips: [
      { title: "Include the order reference", body: "If it's about an order, its reference (ORD-…) is in My orders. You'll need it if you contact the team." },
      { title: "Explain one order", body: "For a plain-language explanation of a specific order, open it in My orders and choose Explain this order." },
      { title: "Never share passwords", body: "SociVanta never asks for your password or login codes — not in orders, and not in support." },
    ],
    faqs: [
      { q: "Is the AI Support Assistant a person?", a: "No. It's an automated assistant that answers from SociVanta's verified help information. When a person is needed, it tells you how to reach one." },
      { q: "Does it open a support ticket for me?", a: "No. Support tickets aren't connected yet, so nothing you type is sent to the team. The assistant says so instead of pretending, and shows any contact channel that is available." },
      { q: "Can it refund or cancel my order?", a: "No. It can't change orders, payments or your account. It explains what you can do yourself — such as canceling from My orders before work starts — and when the team needs to decide." },
      { q: "Are my conversations saved?", a: "No. The conversation lasts only while the page is open, and personal details are removed before anything reaches the AI model." },
    ],
    next: [
      { toolId: "order-explanation", text: "About one specific order? Get it explained from its record." },
      { toolId: "assistant", text: "General questions about SociVanta? Ask the SociVanta AI Assistant." },
    ],
  },
};

/** Whether a tool page has enough independent value to be indexed and listed in the sitemap. */
export const isIndexableTool = (toolId: string) => Object.hasOwn(TOOL_GUIDES, toolId);

/** How SociVanta AI produces results — shown on every tool guide (transparency for readers and search systems). */
export const HOW_RESULTS_ARE_MADE = [
  "Your brief is sent to an AI language model with fixed instructions for the tool. Personal details such as email addresses, phone numbers and card numbers are removed first.",
  "The model's answer must follow the tool's structure. SociVanta checks it, removes links and personal details, and only then shows it to you.",
  "SociVanta doesn't store your brief or results. Nothing is posted, scheduled or sent to your accounts — you copy what you want.",
];
