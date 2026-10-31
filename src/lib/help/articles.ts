/*
 * SociVanta Help Center content (Phase 5G-A). Human-written guides that
 * describe only what the platform actually does today. Things that depend on
 * configuration (ordering being open, bank deposits, AI tools being live) are
 * described conditionally, because each page shows the live state.
 * No processing times, guarantees or payment methods are promised.
 */

export type HelpCategoryId = "getting-started" | "account" | "orders" | "payments" | "ai-tools" | "social" | "troubleshooting";

export const HELP_CATEGORIES: { id: HelpCategoryId; name: string; description: string }[] = [
  { id: "getting-started", name: "Getting Started", description: "What SociVanta is and how to begin." },
  { id: "account", name: "Account & Security", description: "Sign-in, email verification and keeping your account safe." },
  { id: "orders", name: "Services & Ordering", description: "Choosing services, placing orders and following them." },
  { id: "payments", name: "Wallet & Payments", description: "Your balance, adding funds, cancellations and refunds." },
  { id: "ai-tools", name: "AI Tools", description: "SociVanta AI, daily allowances and what's available." },
  { id: "social", name: "Social Management", description: "Drafts, the calendar, campaigns and automations." },
  { id: "troubleshooting", name: "Troubleshooting & Support", description: "Fixing common problems and contacting our team." },
];

export interface HelpArticle {
  slug: string;
  category: HelpCategoryId;
  title: string;
  /** A one- or two-sentence direct answer, shown first. */
  answer: string;
  /** Optional numbered steps. */
  steps?: string[];
  /** Further paragraphs. Plain text. */
  body?: string[];
  related: string[];
  /** Search keywords beyond the title (synonyms people use). */
  keywords: string[];
  updated: string;
  /** Short SEO description (120–175 characters). */
  description: string;
}

const UPDATED = "2026-10-31";

export const HELP_ARTICLES: HelpArticle[] = [
  {
    slug: "what-is-socivanta",
    category: "getting-started",
    title: "What is SociVanta?",
    answer: "SociVanta is a marketplace for social media services across 15 platforms, together with SociVanta AI: tools for writing, planning and organising your social content.",
    body: [
      "The service catalog covers platforms such as Instagram, TikTok, YouTube, Facebook, X, LinkedIn, Pinterest, Telegram, WhatsApp, Snapchat, Twitch, Discord, Reddit, music platforms and website promotion.",
      "Your dashboard brings everything together: orders, your wallet, support tickets, the AI workspace and the social workspace.",
      "Results from social media services always depend on the platforms themselves, so SociVanta doesn't promise specific outcomes.",
    ],
    related: ["create-an-account", "how-ordering-works", "what-are-socivanta-ai-tools"],
    keywords: ["about", "smm", "panel", "marketplace", "platforms"],
    updated: UPDATED,
    description: "SociVanta is a social media services marketplace for 15 platforms, plus SociVanta AI tools for writing and planning content. Here's what it offers.",
  },
  {
    slug: "create-an-account",
    category: "getting-started",
    title: "How do I create a SociVanta account?",
    answer: "Sign up with your name, email address and a password, then confirm your email by clicking the link we send you. Accounts are free.",
    steps: ["Go to the sign-up page and enter your details.", "Open the email from SociVanta and click the verification link.", "Sign in. Your dashboard is ready to use."],
    body: ["A verified email is needed before you can place orders, use SociVanta AI tools or open support tickets."],
    related: ["verification-email-not-arriving", "account-security", "what-is-socivanta"],
    keywords: ["sign up", "register", "join", "new account", "free"],
    updated: UPDATED,
    description: "Create a free SociVanta account in a minute: sign up with your email, confirm it from the verification email, and you're ready to use your dashboard.",
  },
  {
    slug: "how-referrals-work",
    category: "getting-started",
    title: "How do SociVanta referrals work?",
    answer: "Every account has a personal referral link and code on the Referrals page. When someone creates a new account with your link, or enters your code at sign-up, they appear in your referrals.",
    steps: ["Open Referrals in your dashboard.", "Copy your link or code, or use Share on your phone.", "When someone signs up with it, you'll see them listed, along with whether they've confirmed their email."],
    body: [
      "A referral is counted only when a new account is created. Copying or sharing your link isn't counted on its own, each person can be referred only once, and you can't refer yourself.",
      "Our team may review referrals to keep the program fair. A referral can show as Signed up, Under review or Not eligible.",
      "Referral rewards aren't available yet. The Referrals page shows “Rewards coming soon”, and we'll publish the rules before any reward applies.",
      "You can replace your code from the Referrals page. Your old link then stops working for new sign-ups, and people who already joined stay in your list.",
    ],
    related: ["create-an-account", "account-security", "contact-support"],
    keywords: ["referral", "refer", "invite", "friend", "share link", "code", "reward", "affiliate"],
    updated: UPDATED,
    description: "Share your SociVanta referral link or code and see who joins with it. Each person is counted once, after they create an account. Rewards are coming soon.",
  },
  {
    slug: "account-security",
    category: "account",
    title: "How do I keep my account secure?",
    answer: "Use a strong, unique password and review where you're signed in. Both are on the Sign-in & security page in your dashboard.",
    steps: ["Open your dashboard and go to Sign-in & security.", "Change your password if it's reused elsewhere or might be known.", "Check the list of signed-in sessions and sign out of any you don't recognise."],
    body: ["SociVanta staff will never ask for your password, sign-in codes or card details, including in support tickets. If a message asks for them, it isn't from us."],
    related: ["reset-your-password", "create-an-account", "contact-support"],
    keywords: ["security", "password", "sessions", "hacked", "safe", "sign out"],
    updated: UPDATED,
    description: "Keep your SociVanta account safe: change your password and review your signed-in sessions from the Sign-in & security page. We never ask for passwords.",
  },
  {
    slug: "reset-your-password",
    category: "account",
    title: "How do I reset a forgotten password?",
    answer: "Use “Forgot password” on the sign-in page. We'll email you a link to choose a new password.",
    steps: ["On the sign-in page, choose Forgot password.", "Enter the email address on your account.", "Open the email and follow the link to set a new password."],
    body: ["For your security the link expires after a while. If it has expired, request a new one."],
    related: ["account-security", "verification-email-not-arriving"],
    keywords: ["forgot", "reset", "password", "can't log in", "locked out"],
    updated: UPDATED,
    description: "Forgot your SociVanta password? Request a reset link from the sign-in page and choose a new password from the email we send you.",
  },
  {
    slug: "how-ordering-works",
    category: "orders",
    title: "How does ordering work?",
    answer: "Choose a service, enter what it needs (such as your profile or post link and a quantity within its limits), review the price and confirm. Orders are paid from your wallet balance.",
    steps: ["Open New order in your dashboard and pick a service.", "Fill in the details the service asks for.", "Review the total and confirm. The amount is taken from your wallet."],
    body: [
      "A service can be ordered only after its pricing, supplier, fulfilment, payment, legal and technical checks are complete. While ordering isn't open, you can browse the catalog but can't place orders; the New order page shows the current state.",
      "Every order is reviewed by our team before work starts.",
    ],
    related: ["order-statuses", "cancel-an-order", "wallet-and-adding-funds"],
    keywords: ["order", "buy", "purchase", "checkout", "new order", "quantity", "link"],
    updated: UPDATED,
    description: "How ordering works on SociVanta: pick a service, add its details, review the price and pay from your wallet. Every order is reviewed before work starts.",
  },
  {
    slug: "order-statuses",
    category: "orders",
    title: "What do the order statuses mean?",
    answer: "Each status tells you where your order is: Awaiting review, Approved, In progress, Partially delivered, Needs your information, Completed, Rejected, Canceled, Failed or Refunded.",
    body: [
      "Awaiting review: our team checks every order before work starts. Approved: it passed review. In progress: work has started.",
      "Needs your information: we asked for something. Update the details from the order to continue.",
      "Rejected or Canceled: the full amount goes back to your wallet. Failed: our team reviews what you're owed. Every status change is recorded on the order.",
    ],
    related: ["cancel-an-order", "order-needs-information", "how-ordering-works"],
    keywords: ["status", "track", "progress", "pending", "processing", "completed", "where is my order"],
    updated: UPDATED,
    description: "What each SociVanta order status means, from Awaiting review to Completed, and what happens to your money when an order is rejected or canceled.",
  },
  {
    slug: "cancel-an-order",
    category: "orders",
    title: "Can I cancel an order?",
    answer: "Yes, while it's Awaiting review or Needs your information. Cancel it from the order in My orders, and the full amount goes back to your wallet.",
    body: ["Once work has started, an order can't be canceled from your dashboard. Open a support ticket and our team will review it. Refunds after work has started aren't automatic."],
    related: ["refunds-and-cancellations", "order-statuses", "contact-support"],
    keywords: ["cancel", "stop", "undo", "mistake", "wrong link"],
    updated: UPDATED,
    description: "You can cancel a SociVanta order yourself while it's awaiting review or needs your information, and the full amount returns to your wallet.",
  },
  {
    slug: "order-needs-information",
    category: "troubleshooting",
    title: "My order says “Needs your information”. What should I do?",
    answer: "Our team needs something from you to continue, often a corrected link or detail. Open the order, read the message, and update the details.",
    steps: ["Open My orders and select the order.", "Read the message from our team.", "Update the requested details and save. The order goes back for review."],
    body: ["You can also cancel the order at this stage and get the full amount back."],
    related: ["order-statuses", "cancel-an-order", "contact-support"],
    keywords: ["needs information", "action required", "update details", "link wrong"],
    updated: UPDATED,
    description: "If a SociVanta order needs your information, open it, read our team's message and update the details. You can also cancel it for a full refund to your wallet.",
  },
  {
    slug: "wallet-and-adding-funds",
    category: "payments",
    title: "How does the wallet work, and how do I add funds?",
    answer: "Orders are paid from your SociVanta wallet balance. When a payment method is available, you add funds from the Add funds page in your dashboard.",
    body: [
      "If bank transfer is available, the Add funds page shows the details to use. Each deposit is checked and verified by our team before it's credited to your wallet.",
      "If Add funds says payment methods are still being set up, adding funds isn't available yet.",
      "Your balance and every movement in it are listed under Transactions.",
    ],
    related: ["refunds-and-cancellations", "how-ordering-works"],
    keywords: ["wallet", "balance", "add funds", "deposit", "top up", "bank transfer", "pay"],
    updated: UPDATED,
    description: "How your SociVanta wallet works: orders are paid from your balance, funds are added from the Add funds page when a payment method is available.",
  },
  {
    slug: "refunds-and-cancellations",
    category: "payments",
    title: "How do refunds and cancellations work?",
    answer: "Canceled and rejected orders return the full amount to your wallet automatically. Once work has started, any refund needs a reviewed decision by our team.",
    body: ["To ask about a refund, open a support ticket and link the order. Our team reviews each case; refunds after work has started aren't automatic, and nothing on this page is a promise of one."],
    related: ["cancel-an-order", "contact-support", "wallet-and-adding-funds"],
    keywords: ["refund", "money back", "return", "dispute", "chargeback"],
    updated: UPDATED,
    description: "Canceled and rejected SociVanta orders return the full amount to your wallet. Refunds after work has started are reviewed case by case by our team.",
  },
  {
    slug: "what-are-socivanta-ai-tools",
    category: "ai-tools",
    title: "What are SociVanta AI tools?",
    answer: "SociVanta AI is a set of tools for social content: captions, hashtags, post ideas, content calendars, growth advice and roadmaps, service recommendations and an assistant.",
    body: [
      "Each tool's page shows whether it's available right now or coming soon. Tools that aren't live yet show a preview of what they'll ask for and how results are organised.",
      "AI can make mistakes, so always read results before you use them.",
    ],
    related: ["ai-daily-allowances", "social-management-overview"],
    keywords: ["ai", "caption", "hashtag", "ideas", "calendar", "growth", "assistant", "chatgpt"],
    updated: UPDATED,
    description: "SociVanta AI tools help with captions, hashtags, post ideas, calendars and growth planning. Each tool page shows whether it's available or coming soon.",
  },
  {
    slug: "ai-daily-allowances",
    category: "ai-tools",
    title: "How do AI daily allowances work?",
    answer: "Each AI tool includes a number of free runs per account per day. Completed runs count; errors and timeouts don't. Allowances reset every day at 00:00 UTC.",
    body: ["Your dashboard's AI workspace has a Usage page showing each tool's allowance and what you've used today. Allowances start when a tool launches."],
    related: ["what-are-socivanta-ai-tools"],
    keywords: ["limit", "allowance", "free runs", "quota", "reset", "usage"],
    updated: UPDATED,
    description: "SociVanta AI tools include free daily runs per account. Only completed runs count, and allowances reset every day at 00:00 UTC. See usage in your dashboard.",
  },
  {
    slug: "social-management-overview",
    category: "social",
    title: "What can I do in the social workspace?",
    answer: "You can write and organise drafts for each platform, plan them on a calendar, and set up Automation Studio reminders and checklists.",
    body: [
      "Connecting social accounts depends on approvals from each platform; the Accounts page shows which ones can be connected.",
      "Publishing to social platforms is switched off for now, so nothing is posted for you. Drafts and planning work today.",
    ],
    related: ["automation-studio", "what-are-socivanta-ai-tools"],
    keywords: ["social", "drafts", "calendar", "schedule", "post", "publishing", "connect account"],
    updated: UPDATED,
    description: "The SociVanta social workspace lets you write drafts, plan them on a calendar and set up automations. Publishing is switched off for now; nothing is posted for you.",
  },
  {
    slug: "automation-studio",
    category: "social",
    title: "What is Automation Studio?",
    answer: "Automation Studio runs simple workflows on a schedule, such as weekly reminders, checklists and draft reviews. It works without AI and never posts, orders or spends money.",
    steps: ["Open Automations in the social workspace.", "Start from a template or build your own in four steps.", "Review what it will do, tick to authorise it, and activate it."],
    body: ["Results arrive in your Automation inbox. You can pause, edit or delete an automation at any time."],
    related: ["social-management-overview"],
    keywords: ["automation", "workflow", "reminder", "checklist", "schedule"],
    updated: UPDATED,
    description: "Automation Studio runs simple scheduled workflows like reminders, checklists and draft reviews. It works without AI and never posts or spends money.",
  },
  {
    slug: "verification-email-not-arriving",
    category: "troubleshooting",
    title: "I didn't receive my verification email",
    answer: "Check your spam or promotions folder first, then request a new link from the verification page. Make sure the email address on your account is correct.",
    steps: ["Search your inbox, spam and promotions folders for SociVanta.", "Request a new verification email from the verification page.", "If it still doesn't arrive, wait a few minutes before trying again."],
    related: ["create-an-account", "reset-your-password"],
    keywords: ["verification", "email", "not received", "confirm email", "spam"],
    updated: UPDATED,
    description: "Didn't get your SociVanta verification email? Check spam and promotions, then request a new link from the verification page.",
  },
  {
    slug: "contact-support",
    category: "troubleshooting",
    title: "How do I contact SociVanta support?",
    answer: "Open a support ticket from Support in your dashboard. Describe the problem, link the order if it's about one, and our team will reply in the ticket.",
    steps: ["Sign in and open Support in your dashboard.", "Choose New ticket, pick a topic and describe what you need.", "Follow the conversation in the ticket. We'll show you when we've replied."],
    body: [
      "Ticket statuses tell you where things stand: Awaiting our reply, In progress, Waiting for you, Resolved and Closed. When we're waiting for you, reply in the ticket to continue.",
      "You can close a ticket when you no longer need help, and reopen a closed ticket for 14 days.",
      "Never include passwords, sign-in codes or card numbers in a ticket. File attachments aren't available yet, so describe the problem in words or include a link.",
    ],
    related: ["refunds-and-cancellations", "order-needs-information", "account-security"],
    keywords: ["support", "help", "contact", "ticket", "human", "talk to someone", "email"],
    updated: UPDATED,
    description: "Contact SociVanta support by opening a ticket from your dashboard. Track replies and status in one place, and reopen closed tickets for 14 days.",
  },
];

export const HELP_ARTICLE_BY_SLUG = Object.fromEntries(HELP_ARTICLES.map((a) => [a.slug, a])) as Record<string, HelpArticle>;
export const helpHref = (slug: string) => `/help/${slug}`;

/** Curated starting points (not popularity data). */
export const POPULAR = ["how-ordering-works", "order-statuses", "cancel-an-order", "wallet-and-adding-funds", "contact-support", "ai-daily-allowances"];
