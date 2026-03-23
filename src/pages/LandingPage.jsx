import { Link } from 'react-router-dom'

const PAINS = [
  'יותר מדי תיאומים בוואטסאפ',
  'משימות שנופלות בין הכיסאות',
  'רשימות קניות לא ברורות שיוצרות כפילויות',
  'יומן משפחתי בלי מקור אמת אחד',
]

const FEATURES = [
  { icon: '🤝', title: 'שיתוף משפחתי אמיתי', text: 'כל בני הבית עובדים על אותו מידע בזמן אמת - בלי טלפון שבור ובלי כפילויות.' },
  { icon: '🛒', title: 'רשימות קניות בזמן אמת', text: 'עדכון מיידי של פריטים וסטטוסים, כך שכולם יודעים מה כבר נקנה ומה חסר.' },
  { icon: '✅', title: 'משימות שלא שוכחים', text: 'שיוך משימה, תאריך יעד, סימון ביצוע והתראות - כדי שפחות דברים יתפספסו.' },
  { icon: '📅', title: 'יומן משפחתי מרוכז', text: 'אירועים ותזכורות במקום אחד שמונע פספוסים ועומס תקשורתי.' },
  { icon: '💳', title: 'תקציב ביתי ברור', text: 'הכנסות והוצאות במבט אחד, עם שליטה חודשית פשוטה להבנה.' },
  { icon: '👶', title: 'מעקב ניו בורן והאכלות', text: 'רואים מיד מתי היתה ההאכלה האחרונה, כדי שגם הורים וגם מטפלת יישארו מסונכרנים.' },
  { icon: '🔔', title: 'התראות בזמן אמת', text: 'עדכונים מהאפליקציה בזמן אמת על משימות, קניות ואירועים - בדיוק כשצריך.' },
]

const STEPS = [
  { num: '01', title: 'פותחים בית', text: 'נרשמים או מצטרפים עם קוד בית קיים - תוך פחות מדקה.' },
  { num: '02', title: 'מגדירים שגרה', text: 'יוצרים רשימות קניות, משימות ואירועים לפי איך שהמשפחה עובדת בפועל.' },
  { num: '03', title: 'רואים תוצאה בשטח', text: 'פחות משימות שנשכחות, קניות ברורות לכולם, ויותר שקט בשגרה היומית.' },
]

const AUDIENCE = [
  { title: 'משפחות צעירות', text: 'פחות עומס בראש ויותר שגרה ברורה סביב קניות, משימות וילדים.' },
  { title: 'זוגות עסוקים', text: 'חלוקת אחריות פשוטה בלי ויכוחים ובלי הודעות אינסופיות.' },
  { title: 'הורים לניו בורן ומטפלות', text: 'תיעוד האכלות והיסטוריה ברורה שעוזרים לזכור מה קרה ומתי - גם בהחלפת משמרות.' },
]

const FAQ = [
  {
    q: 'זה מתאים גם למשפחה קטנה ולא רק למשקי בית גדולים?',
    a: 'כן. המוצר נבנה כדי להיות פשוט גם לזוג, ובמקביל מספיק חזק למשפחה עם כמה ילדים.',
  },
  {
    q: 'צריך להתקין אפליקציה מחנות?',
    a: 'לא חובה. אפשר לפתוח בדפדפן, ובלחיצה אחת להתקין למסך הבית כמו אפליקציה רגילה.',
  },
  {
    q: 'איך שומרים על פרטיות המידע?',
    a: 'המידע מנוהל בתשתית מאובטחת עם הרשאות גישה לפי משתמש ובית.',
  },
]

export default function LandingPage() {
  return (
    <div className="landing-page">
      <header className="landing-hero">
        <div className="landing-nav">
          <div className="landing-brand">🏠 הבית שלי</div>
          <div className="landing-nav-actions">
            <Link to="/" className="btn btn-primary btn-sm">התחברות</Link>
          </div>
        </div>

        <div className="landing-hero-inner">
          <p className="landing-kicker">Made for real families</p>
          <h1 className="landing-title">לנהל בית בלי כאוס: קניות, משימות, יומן ותקציב במסך אחד</h1>
          <p className="landing-subtitle">
            הבית שלי נבנתה כדי לפתור בעיה אמיתית: עומס תיאומים יומיומי בין בני משפחה.
            הכל מסונכרן בזמן אמת, כולל התראות מהאפליקציה, כדי לא לשכוח משימות, לשמור על קניות ברורות לכל בני הבית ולחסוך טלפון שבור.
          </p>
          <div className="landing-cta-row">
            <Link to="/" className="btn btn-primary">מתחילים בחינם</Link>
            <a href="#features" className="btn btn-ghost">לראות את המערכת</a>
          </div>
          <div className="landing-proof">
            <span>⚡ מהיר גם בנייד</span>
            <span>🔒 גישה מאובטחת לכל בית</span>
            <span>👨‍👩‍👧‍👦 כל בני המשפחה בזמן אמת</span>
          </div>
        </div>
      </header>

      <section className="landing-section">
        <div className="landing-section-head">
          <p className="landing-kicker">הבעיה שאנחנו פותרים</p>
          <h2>אם אחד מאלה מוכר לך - המוצר נבנה בדיוק בשבילך</h2>
        </div>
        <div className="landing-pains">
          {PAINS.map((pain) => (
            <div key={pain} className="landing-pain">• {pain}</div>
          ))}
        </div>
      </section>

      <section id="features" className="landing-section">
        <div className="landing-section-head">
          <p className="landing-kicker">יכולות מרכזיות</p>
          <h2>כל היכולות החשובות לניהול בית, בלי מורכבות מיותרת</h2>
        </div>
        <div className="landing-grid">
          {FEATURES.map((f) => (
            <article key={f.title} className="landing-card">
              <div className="landing-card-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section">
        <div className="landing-section-head">
          <p className="landing-kicker">איך זה עובד</p>
          <h2>תהליך קצר שאפשר להתחיל להשתמש בו כבר היום</h2>
        </div>
        <div className="landing-steps">
          {STEPS.map((s) => (
            <div key={s.num} className="landing-step">
              <div className="landing-step-num">{s.num}</div>
              <div>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-section">
        <div className="landing-section-head">
          <p className="landing-kicker">למי זה מתאים</p>
          <h2>מוצר פרקטי למשפחות שרוצות סדר בלי מאמץ</h2>
        </div>
        <div className="landing-investor-grid">
          {AUDIENCE.map((item) => (
            <article key={item.title} className="landing-card">
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section landing-investor">
        <div className="landing-section-head">
          <p className="landing-kicker">למשקיעים ושותפים</p>
          <h2>מודל עסקי ברור עם מוצר שנוגע בצורך יומיומי</h2>
        </div>
        <div className="landing-investor-grid">
          <div className="landing-card">
            <h3>Engagement טבעי</h3>
            <p>ניהול בית הוא צורך קבוע ולכן יש שימוש חוזר לאורך השבוע, לא רק שימוש חד-פעמי.</p>
          </div>
          <div className="landing-card">
            <h3>מוניטיזציה ישירה</h3>
            <p>מודל Freemium עם מסלול Pro משפחתי מאפשר הכנסות חוזרות בצורה פשוטה וברורה.</p>
          </div>
          <div className="landing-card">
            <h3>סקייל יעיל</h3>
            <p>תשתית PWA חוסכת עלויות הפצה ותומכת שיפור מהיר במוצר על בסיס פידבק אמיתי.</p>
          </div>
        </div>
      </section>

      <section className="landing-section">
        <div className="landing-section-head">
          <p className="landing-kicker">שאלות נפוצות</p>
          <h2>תשובות קצרות לפני שמתחילים</h2>
        </div>
        <div className="landing-faq">
          {FAQ.map((item) => (
            <article key={item.q} className="landing-card">
              <h3>{item.q}</h3>
              <p>{item.a}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-cta">
        <h2>רוצים לראות את זה עובד אצלכם בבית?</h2>
        <p>פותחים חשבון תוך דקה, מזמינים את בני הבית ומתחילים לנהל הכל במקום אחד.</p>
        <Link to="/" className="btn btn-primary">התחברות / הרשמה</Link>
      </section>
    </div>
  )
}
