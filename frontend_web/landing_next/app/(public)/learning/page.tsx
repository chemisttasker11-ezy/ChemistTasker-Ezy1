'use client';

import Link from 'next/link';
import {useEffect,useState} from 'react';
import {BookOpenCheck,GraduationCap,Newspaper,Users} from 'lucide-react';
import {useSession} from '@/shared/session-provider';
import {chemistTaskerApi} from '@/lib/chemisttasker-api';
import styles from './learning.module.css';

type Article={id:number;title:string;slug:string;kind:'blog'|'news';topic:string;excerpt:string;read_minutes:number;published_at:string};
type ArticleResponse={results?:Article[]};
type Options={role_code:string|null;role_label:string|null;role_guidance:string[]};
const rolePath:Record<string,string>={OWNER:'Business, leadership and pharmacy operations',PHARMACIST:'Clinical practice, career and professional development',INTERN:'Internship, registration and workplace development',STUDENT:'Study, placement and transition to practice',TECHNICIAN:'Dispensary workflow and workplace development',ASSISTANT:'Retail pharmacy, customer service and workplace development',EXPLORER:'Career discovery and pharmacy pathways',CAREER_SWITCHER:'Career transition and pharmacy pathways'};

export default function LearningPage(){
 const session=useSession();const [articles,setArticles]=useState<Article[]>([]);const [options,setOptions]=useState<Options>();
 useEffect(()=>{void chemistTaskerApi.publicContent.listArticles({topic:'learning'}).then(data=>setArticles((data as ArticleResponse).results||[])).catch(()=>{});if(session.status==='authenticated')void chemistTaskerApi.marketplace.getListingOptions().then(data=>setOptions(data as Options)).catch(()=>{});},[session.status]);
 const path=options?.role_code?rolePath[options.role_code]:undefined;
 return <div className={styles.page}><section className={styles.hero}><div className="container"><p>CHEMISTTASKER LEARNING</p><GraduationCap size={38}/><h1>Learn across the pharmacy community.</h1><span>Shared resources for everyone, with role-relevant pathways when you are signed in.</span>{path&&<div className={styles.role}><strong>{options?.role_label}</strong><small>{path}</small></div>}</div></section><section className="container"><div className={styles.links}><Link href="/hubs"><Users/> Community discussions</Link><Link href="/blog"><BookOpenCheck/> Blog</Link><Link href="/news"><Newspaper/> News</Link></div><div className={styles.heading}><h2>Learning resources</h2><p>Editorial resources tagged for learning are shown here.</p></div>{articles.length?<div className={styles.grid}>{articles.map(article=><Link href={`/${article.kind}/${article.slug}`} key={article.id}><span>{article.kind} · {article.read_minutes} min</span><h3>{article.title}</h3><p>{article.excerpt}</p></Link>)}</div>:<section className={styles.empty}><BookOpenCheck/><h3>No learning resources are published yet.</h3><p>The learning hub is ready to surface editorial resources tagged with the learning topic.</p></section>}</section></div>;
}
