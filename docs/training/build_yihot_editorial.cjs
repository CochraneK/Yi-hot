const pptxgen = require('pptxgenjs');
const pptx = new pptxgen();
pptx.layout='LAYOUT_WIDE';
pptx.author='YiHot / ChatGPT';
pptx.subject='YiHot 非营利公益情报系统：重新设计的培训与交接演示';
pptx.title='YiHot · 让值得关注的公益信息，更容易被发现';
pptx.company='YiHot';
pptx.lang='zh-CN';
pptx.theme={headFontFace:'Noto Sans CJK SC',bodyFontFace:'Noto Sans CJK SC',lang:'zh-CN'};
pptx.defineSlideMaster({title:'base', background:{color:'F9F7F2'},objects:[]});
const S=pptx.ShapeType;const W=13.333,H=7.5;
const C={ink:'132B35',ink2:'203C43',muted:'667983',cream:'F9F7F2',white:'FFFFFF',mint:'E2EEE8',green:'247E74',green2:'65A89B',orange:'E87658',gold:'C6AA70',hair:'DDE3DF',blue:'497A91',pink:'F5E5DE',pale:'EDF2F0',subtle:'ECE9E2',coal:'10252D'};
const FN='Noto Sans CJK SC';
let num=0;
function rect(sl,x,y,w,h,fill,r=0,line='none',sw=0,alpha=0){sl.addShape(r?S.roundRect:S.rect,{x,y,w,h,rectRadius:r,fill:{color:fill,transparency:alpha},line:{color:line==='none'?fill:line,transparency:line==='none'?100:0,width:sw},radius:r});}
function line(sl,x1,y1,x2,y2,col=C.hair,width=1,dash){sl.addShape(S.line,{x:x1,y:y1,w:x2-x1,h:y2-y1,line:{color:col,width,dashType:dash||'solid'}})}
function circ(sl,x,y,d,col,outline='none',sw=0,alpha=0){sl.addShape(S.ellipse,{x,y,w:d,h:d,fill:{color:col,transparency:alpha},line:{color:outline==='none'?col:outline,transparency:outline==='none'?100:0,width:sw}})}
function txt(sl,text,x,y,w,h,size=22,col=C.ink,opt={}){
 sl.addText(String(text),{x,y,w,h,fontFace:opt.serif?'Noto Serif CJK SC':FN,fontSize:size,bold:opt.bold||false,breakLine:false,color:col,margin:0,fit:'shrink',valign:opt.valign||'mid',align:opt.align||'left',charSpacing:opt.spacing||0,transparency:opt.opacity||0,lineSpacingMultiple:1.08,paraSpaceAfterPt:0,rotate:opt.rotate||0,italic:opt.italic||false,...opt});
}
function pill(sl,text,x,y,w,fill=C.mint,color=C.green,font=11){rect(sl,x,y,w,.30,fill,.15);txt(sl,text,x+.12,y+.015,w-.24,.26,font,color,{bold:true,align:'center'});}
function footer(sl,{dark=false,section=''}={}){const color=dark?'AFC8BF':C.muted;line(sl,.62,7.12,12.7,7.12,dark?'36525B':C.hair,.65);txt(sl,'YiHot  /  FIELD NOTES',.64,7.17,4,.15,9,color,{bold:true,spacing:1.5});txt(sl,section,5,7.17,3.35,.15,9,color,{align:'center'});txt(sl,String(num).padStart(2,'0')+' / 40',11.58,7.14,1.15,.20,10,color,{align:'right',bold:true});}
function slide(section,{dark=false,nav=true}={}){num++;let sl=pptx.addSlide();sl.background={color:dark?C.ink:C.cream};if(nav)footer(sl,{dark,section});return sl;}
function header(sl,kicker,title,sub=''){pill(sl,kicker,.66,.52,Math.max(1.2,kicker.length*.098+.36),C.mint,C.green,10);txt(sl,title,.64,1.03,12.04,.60,30,C.ink,{bold:true});if(sub)txt(sl,sub,.68,1.75,11.9,.42,15,C.muted);}
function tag(sl,text,x,y,color=C.green){rect(sl,x,y,.055,.23,color,.02);txt(sl,text,x+.18,y-.01,4,.28,11,color,{bold:true,spacing:.8});}
function dots(sl,x,y,n=10,r=.045,col=C.green,dx=.22,dy=.18){for(let i=0;i<n;i++)circ(sl,x+(i%5)*dx,y+Math.floor(i/5)*dy,r,col)}
function numBox(sl,v,label,x,y,w=2.6,{dark=false,accent=C.green,extra=''}={}){rect(sl,x,y,w,1.53,dark?'1A3941':C.white,.16,dark?'1A3941':C.hair,.8);rect(sl,x+.19,y+.16,.045,.33,accent,.02);txt(sl,v,x+.28,y+.19,w-.42,.70,40,dark?C.white:C.ink,{bold:true});txt(sl,label,x+.30,y+.96,w-.45,.24,14,dark?'D8E6E0':C.ink,{bold:true});if(extra)txt(sl,extra,x+.30,y+1.25,w-.45,.14,10,dark?'9FB5AD':C.muted);}
function card(sl,x,y,w,h,{dark=false,fill,stroke}={}){rect(sl,x,y,w,h,fill||(dark?'1E3B43':C.white),.20,stroke||(dark?'244650':C.hair),.6)}
function callout(sl,text,x,y,w,{color=C.orange}={}){rect(sl,x,y,.06,.49,color,.02);txt(sl,text,x+.22,y-.02,w-.3,.55,16,C.ink,{bold:true});}
function smallCaption(sl,text){txt(sl,text,.69,6.76,11.96,.26,10,C.muted)}
function bigNum(sl,n,label,x,y,color=C.green,size=78){txt(sl,n,x,y,4.5,1.08,size,color,{bold:true});txt(sl,label,x,y+1.05,4.7,.32,16,C.muted)}
function panelTitle(sl,title,x,y){txt(sl,title,x,y,5.1,.34,16,C.ink,{bold:true});}
function arrow(sl,x,y,col=C.green){sl.addShape(S.chevron,{x,y,w:.30,h:.34,fill:{color:col},line:{color:col,transparency:100}})}
function divider(sec,zh,en,desc,accent=C.orange){const sl=slide(sec,{dark:true});rect(sl,.0,.0,.16,H,accent);txt(sl,en,.75,.68,7,.36,14,C.green2,{bold:true,spacing:2.5});txt(sl,zh,.74,1.65,10.7,1.28,53,C.white,{bold:true});txt(sl,desc,.79,3.38,8.0,.86,22,'CFDFD8');line(sl,.76,5.18,8.95,5.18,'3B5960',1);txt(sl,sec,.80,5.54,7,.34,13,C.green2,{spacing:2});for(let i=0;i<11;i++){circ(sl,9.6+(i%4)*.53,.87+Math.floor(i/4)*.57,.10,accent,undefined,0,10+i*5)}circ(sl,10.0,2.55,3.8,'FFFFFF','FFFFFF',.5,94);circ(sl,10.8,3.35,2.2,'FFFFFF','FFFFFF',.5,92);return sl;}
// 01 cover
{
let sl=slide('OVERVIEW',{dark:true});rect(sl,.0,0,.13,7.5,C.orange);pill(sl,'PUBLIC INTEREST INTELLIGENCE',.74,.71,3.35,'244A4F','A8D6C7',11);txt(sl,'YiHot',.73,1.42,7.7,1.12,75,C.white,{bold:true});txt(sl,'看见值得关注的公益信息',.77,2.77,9.2,.58,33,C.white,{bold:true});txt(sl,'从信息发现，到可追溯的理解与行动',.80,3.73,9.5,.48,21,'B9D2C7');line(sl,.82,4.65,8.6,4.65,'45656B',1);txt(sl,'使用 · 信源 · AI 编辑 · 成本 · 运营 · 交接',.81,5.02,9.5,.38,17,'A9C6BD');txt(sl,'研究与培训演示｜2026.11 · 依据已核验历史快照',.80,5.70,8.9,.3,12,'879F9E');for(let i=0;i<7;i++)circ(sl,8.6+i*.44,.76+i*.16,4.8-i*.46,'FFFFFF','FFFFFF',1,100);circ(sl,10.8,1.73,1.25,C.orange);rect(sl,11.34,2.26,.28,2.66,C.orange,.12);circ(sl,10.74,4.5,.82,C.green2);}
// 02 full manifesto
{
const sl=slide('WHY IT MATTERS');txt(sl,'信息很多。',.78,1.28,11.5,1.00,54,C.ink,{bold:true});txt(sl,'真正需要被看见的，却容易散落各处。',.78,2.48,11.8,.80,35,C.green,{bold:true});rect(sl,.8,4.01,11.68,1.13,C.mint,.2);txt(sl,'YiHot 想减少重复搜寻，让有价值的公共信息更容易找到原始证据。',1.16,4.33,10.9,.56,23,C.ink,{bold:true});txt(sl,'定位是线索与理解工具，不是新闻首发媒体，也不是事实裁判。',.82,5.76,11.7,.4,15,C.muted);}
// 03 problem
{
const sl=slide('WHY IT MATTERS');header(sl,'PROBLEM','问题不是缺消息，而是消息太分散','信息沿着彼此独立的渠道流动，读者需要重复完成发现、筛选、核实。');
const xs=[.80,4.94,9.08],titles=['散落','重复','难追溯'],caps=['政府、机构、媒体、邮件','同一事件多次转载','时间、主体、原文失配'],glyphs=['01','02','03'];for(let i=0;i<3;i++){card(sl,xs[i],2.58,3.52,2.96);txt(sl,glyphs[i],xs[i]+.25,2.88,1.12,.53,32,[C.orange,C.green,C.blue][i],{bold:true});txt(sl,titles[i],xs[i]+.25,3.62,2.9,.59,29,C.ink,{bold:true});txt(sl,caps[i],xs[i]+.26,4.50,2.96,.5,16,C.muted);}
smallCaption(sl,'策略：先还原事实链，再讨论热度或优先级。');}
// 04 product pipeline 5 phases
{
const sl=slide('PRODUCT LOGIC');header(sl,'WORKFLOW','从发现，到行动','把重复劳动交给系统，把关键判断留给人。');let xs=[.72,3.27,5.82,8.37,10.92],labels=['发现','核验','理解','跟踪','行动'],descs=['网站 / RSS / 搜索','原始主体与日期','摘要 / 结构化','主题 / 周月报','进一步调查 / 合作'];xs.forEach((x,i)=>{card(sl,x,2.64,2.04,2.19);circ(sl,x+.67,2.89,.71,[C.green,C.blue,C.orange,C.gold,C.green][i]);txt(sl,String(i+1).padStart(2,'0'),x+.74,3.02,.6,.4,18,C.white,{bold:true});txt(sl,labels[i],x+.34,3.84,1.4,.47,23,C.ink,{bold:true,align:'center'});if(i<4)arrow(sl,x+2.15,3.52);});
for(let i=0;i<5;i++)txt(sl,descs[i],xs[i]-.10,5.13,2.19,.54,13,C.muted,{align:'center'});}
// 05 personas
{
const sl=slide('READER EXPERIENCE');header(sl,'WHO IT SERVES','不是为所有人塞同一张信息表','YiHot 提供不同深度的阅读入口。');
const ar=[{t:'普通读者',v:'知道发生了什么',d:'动态 · 热点 · 原文',c:C.orange},{t:'公益从业者',v:'判断哪些值得跟进',d:'主题 · 机构 · 周报',c:C.green},{t:'研究 / 运营人员',v:'追溯证据和变化',d:'信源 · 监管 · 数据',c:C.blue}];ar.forEach((o,i)=>{let x=.83+i*4.18;card(sl,x,2.54,3.68,3.28);rect(sl,x+.24,2.80,.59,.58,o.c,.19);txt(sl,String(i+1).padStart(2,'0'),x+.34,2.88,.4,.38,18,C.white,{bold:true});txt(sl,o.t,x+.29,3.68,3.09,.47,26,C.ink,{bold:true});txt(sl,o.v,x+.29,4.29,3.1,.45,17,C.ink);line(sl,x+.29,5.12,x+3.30,5.12,C.hair,1);txt(sl,o.d,x+.29,5.29,3.12,.29,13,C.muted);});}
// 06 UI mock
{
const sl=slide('READER EXPERIENCE');header(sl,'PRODUCT','读者只需看见必要入口','以下是概念化页面结构示意，并非当前站点的实际截图。');card(sl,.79,2.29,11.75,3.80);rect(sl,.79,2.29,2.25,3.80,C.ink,.17);txt(sl,'Y I H O T',1.15,2.65,1.75,.39,20,C.white,{bold:true,spacing:2});['总报','动态','热点','主题','更多'].forEach((t,i)=>{const y=3.25+i*.47;rect(sl,1.02,y,1.8,.36,i===1?'345F61':C.ink,.1);txt(sl,t,1.37,y+.065,1.1,.23,13,i===1?C.white:'C0D0CF',{bold:i===1});});rect(sl,3.37,2.65,8.73,.7,C.mint,.14);txt(sl,'公益动态',3.68,2.79,5.9,.42,25,C.ink,{bold:true});pill(sl,'只看精选',10.35,2.88,1.31,'FFFFFF',C.green,10);for(let i=0;i<3;i++){let y=3.60+i*.75;rect(sl,3.42,y,8.6,.63,C.white,.12,C.hair,.5);circ(sl,3.7,y+.18,.28,[C.green,C.orange,C.blue][i]);txt(sl,['儿童保护项目进展 · 原文可追溯','公益政策更新 · 需核实发布时间','国际研究发布 · 可回到原始机构'][i],4.16,y+.14,6.0,.32,16,C.ink);txt(sl,'查看原文',10.55,y+.17,1.1,.24,11,C.green);}}
// 07 not a media
{
let sl=slide('READER EXPERIENCE');header(sl,'BOUNDARY','系统整理 ≠ 事实已经证实','每条公共信息都应该保留自己的证据边界。');card(sl,.83,2.58,5.54,2.62,{fill:C.mint});txt(sl,'我们会做',1.16,2.95,4.7,.45,26,C.green,{bold:true});txt(sl,'发现 · 去重 · 关联 · 摘要 · 溯源',1.16,3.84,4.85,.43,18,C.ink);card(sl,6.76,2.58,5.71,2.62,{fill:C.pink});txt(sl,'我们不会替代',7.12,2.95,4.94,.45,26,C.orange,{bold:true});txt(sl,'现场调查 · 法律判断 · 官方表态',7.12,3.84,4.94,.43,18,C.ink);callout(sl,'重要事实以原始发布方和独立证据为准。',1.08,5.80,10.5);}
// 08 journey
{
const sl=slide('READER EXPERIENCE');header(sl,'READING PATH','一个读者的 90 秒路径','首页不是终点，而是打开证据的起点。');let steps=[['01','发现线索','先看最新动态'],['02','辨别性质','来源 / 日期 / 标签'],['03','打开原文','对照原始发布方'],['04','决定跟进','收藏、追踪或分享']];steps.forEach((s,i)=>{let x=.76+i*3.12;rect(sl,x,2.70,2.66,2.63,C.white,.18,C.hair,.5);txt(sl,s[0],x+.25,3.01,2.0,.51,35,[C.green,C.orange,C.blue,C.gold][i],{bold:true});txt(sl,s[1],x+.25,3.82,2.15,.37,20,C.ink,{bold:true});txt(sl,s[2],x+.25,4.43,2.21,.36,14,C.muted);if(i<3)arrow(sl,x+2.70,3.67);});smallCaption(sl,'操作示例；实际入口、权限和运行状态必须以线上站点为准。');}
// 09 section
 divider('SOURCE INTELLIGENCE','信源，不是一个数字','02 / SOURCE SYSTEM','看清来源、技术通道与真实内容贡献。',C.orange);
// 10 two worlds
{
const sl=slide('SOURCE SYSTEM');header(sl,'TWO BASELINES','153 和 210，并不是一组可以相加的数','两个数字属于不同环境，也对应不同日期。');
card(sl,.8,2.50,5.45,2.99);bigNum(sl,'153','GitHub 静态 seed · 2026-11-07',1.20,2.88,C.green,76);card(sl,7.08,2.50,5.45,2.99);bigNum(sl,'210','生产数据库快照 · 2026-10-25',7.51,2.88,C.orange,76);rect(sl,5.91,3.54,1.40,.51,C.ink,.16);txt(sl,'≠',6.14,3.61,.94,.33,25,C.white,{bold:true,align:'center'});txt(sl,'seed 不会覆盖生产已有配置。生产新加的来源也不一定回写 seed。',.83,5.98,11.9,.45,17,C.muted);}
// 11 key data
{
let sl=slide('SOURCE SYSTEM');header(sl,'STATUS SNAPSHOT','210 个登记信源，实际运行有几层？','2026-10-25 13:09 北京时间 · 历史生产快照。');numBox(sl,'210','登记源',.84,2.63,2.73,{accent:C.orange});numBox(sl,'175','启用源',3.85,2.63,2.73,{accent:C.green});numBox(sl,'150','启用且曾入池',6.86,2.63,2.73,{accent:C.blue});numBox(sl,'113','主力源',9.87,2.63,2.73,{accent:C.gold});rect(sl,.84,4.88,11.77,.74,C.pale,.13);txt(sl,'主力 = 已启用，且累计入池文章 ≥ 5；不是又一批新的信源。',1.19,5.05,11.1,.43,18,C.ink,{bold:true});smallCaption(sl,'“登记”“启用”“入池”“主力”是不同的统计条件，不应互换。');}
// 12 source composition
{
const sl=slide('SOURCE SYSTEM');header(sl,'CHANNEL MIX','接入方式：五类技术入口','这是配置源数，不是原始发布机构数量。');
let data=[['网页列表',93,C.green],['网页搜索',72,C.orange],['RSS',26,C.blue],['JSON / API',17,C.gold],['外部系统',2,'92AAA3']];const tot=210;
for(let i=0;i<data.length;i++){let y=2.50+i*.77;txt(sl,data[i][0],.97,y,2.75,.38,19,C.ink,{bold:true});rect(sl,3.61,y+.10,7.50,.22,C.hair,.1);rect(sl,3.61,y+.10,7.50*data[i][1]/93,.22,data[i][2],.1);txt(sl,String(data[i][1]),11.45,y-.06,1.08,.39,22,data[i][2],{bold:true,align:'right'});}
smallCaption(sl,'总计：93 + 72 + 26 + 17 + 2 = 210。');}
// 13 article contribution
{
const sl=slide('SOURCE SYSTEM');header(sl,'VALUE NOT VOLUME','接入最多的，不一定贡献最多','累计入池 1,868 篇 · 2026-10-25 历史快照。');
let cats=[['网页搜索',1256,'67%',C.orange],['网页列表',465,'25%',C.green],['RSS',80,'4%',C.blue],['JSON / API',52,'3%',C.gold],['外部系统',15,'1%','92AAA3']];for(let i=0;i<cats.length;i++){let y=2.49+i*.70;txt(sl,cats[i][0],.89,y,2.29,.38,18,C.ink,{bold:true});rect(sl,3.11,y+.14,7.65,.19,C.hair,.1);rect(sl,3.11,y+.14,7.65*cats[i][1]/1256,.19,cats[i][3],.1);txt(sl,cats[i][2],11.10,y-.02,1.0,.39,23,cats[i][3],{bold:true});}smallCaption(sl,'占比按入池篇数计算，四舍五入；搜索贡献高，不等于搜索结果本身就是一手证据。');}
// 14 nuanced comparison
{
let sl=slide('SOURCE SYSTEM');header(sl,'READ THE DATA','两张表，请不要得出一个“信源质量分”','技术产出、事实可靠、授权使用是三个独立问题。');card(sl,.85,2.54,5.53,3.0);txt(sl,'采集价值',1.19,2.94,3.87,.45,28,C.green,{bold:true});txt(sl,'入池数量 · 独特贡献 · 时效 · 成本',1.22,3.84,4.75,.82,20,C.ink);card(sl,6.70,2.54,5.73,3.0,{fill:C.pale});txt(sl,'事实与权益',7.06,2.94,4.3,.45,28,C.orange,{bold:true});txt(sl,'原始发布者 · 是否转载 · 合法权限',7.06,3.84,4.92,.82,20,C.ink);txt(sl,'源多不是目标；发现得到、来源找得回、信息用得上，才是目标。',.94,6.04,11.5,.47,20,C.ink,{bold:true});}
// 15 axis graph
{
const sl=slide('SOURCE SYSTEM');header(sl,'ONTOLOGY','谁发布 · 怎么来 · 如何治理','三组属性正交，不能放进同一列里互相替代。');let arr=[{num:'01',t:'发布主体',x:.81,color:C.green,vals:['政府与监管','公益机构','媒体 / 研究']},{num:'02',t:'技术入口',x:4.94,color:C.orange,vals:['网页 / RSS','搜索 / API','外部推送']},{num:'03',t:'治理状态',x:9.07,color:C.blue,vals:['审核与许可','启用 / 退避','有效入池'] }];arr.forEach((a,i)=>{card(sl,a.x,2.50,3.43,3.30);pill(sl,a.num,a.x+.22,2.79,.66,a.color,C.white,12);txt(sl,a.t,a.x+.24,3.41,2.94,.46,26,C.ink,{bold:true});a.vals.forEach((v,j)=>{circ(sl,a.x+.30,4.19+j*.47,.09,a.color);txt(sl,v,a.x+.54,4.09+j*.47,2.69,.35,16,C.muted)});});}
// 16 business layers
{
const sl=slide('SOURCE SYSTEM');header(sl,'FIVE LENSES','五层业务阅读地图','按阅读需求分类，不能与五种采集入口相混。');let rows=[['01','政策与治理','法律 / 监管 / 执行',C.green],['02','国际组织与研究','指标 / 研究 / 趋势',C.blue],['03','公益机构与执行','项目 / 服务 / 现场',C.orange],['04','行业生态与合作','资源 / 伙伴 / 机会',C.gold],['05','事件与公共舆情','案例 / 进展 / 讨论',C.green2]];rows.forEach((d,i)=>{let y=2.27+i*.79;card(sl,.87,y,11.60,.67,{fill:i%2?C.pale:C.white});rect(sl,1.06,y+.15,.35,.35,d[3],.1);txt(sl,d[0],1.14,y+.20,.25,.23,12,C.white,{bold:true});txt(sl,d[1],1.73,y+.12,4.1,.40,20,C.ink,{bold:true});txt(sl,d[2],7.03,y+.13,4.6,.38,16,C.muted);});}
// 17 coverage caveat
{
let sl=slide('SOURCE SYSTEM');header(sl,'COVERAGE','“覆盖 31 省”应怎样被证明？','现有技术源数不能直接推断地域与机构覆盖。');
let gridX=1.0,gridY=2.58;for(let i=0;i<31;i++){let col=i%10,row=Math.floor(i/10);rect(sl,gridX+col*1.07,gridY+row*.73,.84,.53,i<20?C.mint:C.pale,.09,C.hair,.4);txt(sl,String(i+1).padStart(2,'0'),gridX+col*1.07+.19,gridY+row*.73+.11,.48,.32,14,i<20?C.green:C.muted,{bold:true,align:'center'});}rect(sl,1.03,5.60,11.18,.55,C.ink,.14);txt(sl,'以上只是 31 个待核验单元的占位格，不代表任何省份的完成情况。',1.43,5.73,10.47,.30,16,C.white,{bold:true});smallCaption(sl,'真正覆盖图需按原始发布主体与行政区划去重，并以当前生产库重新计算。');}
// 18 onboarding
{
const sl=slide('SOURCE SYSTEM');header(sl,'SOURCE GOVERNANCE','新增信源，先验证，再启用','对新信源实施隔离试抓，不直接大批量入池。');let p=[['发现','登记候选'],['预览','核验 5 条'],['审核','版权和时效'],['试跑','48h / 7d 观察'],['启用','持续复核']];p.forEach((d,i)=>{let x=.72+i*2.54;circ(sl,x+.48,2.75,.92,[C.blue,C.green,C.orange,C.gold,C.green2][i]);txt(sl,String(i+1),x+.70,2.94,.46,.35,20,C.white,{bold:true,align:'center'});if(i<4)line(sl,x+1.47,3.19,x+2.58,3.19,C.hair,2);txt(sl,d[0],x+.07,4.08,1.8,.46,25,C.ink,{bold:true,align:'center'});txt(sl,d[1],x+.07,4.70,1.8,.39,15,C.muted,{align:'center'});});rect(sl,1.05,5.76,11.28,.60,C.mint,.16);txt(sl,'HTTP 200 ≠ 内容正确；能抓到 ≠ 有权转载。',1.52,5.92,10.25,.35,19,C.green,{bold:true});}
// 19 decision tree
{
const sl=slide('SOURCE SYSTEM');header(sl,'RIGHTS FIRST','许可是硬门槛，不是加权评分','一个来源再权威，未经许可也不能自动批量抓取或转载。');card(sl,.93,2.42,3.68,2.75,{fill:C.pale});txt(sl,'访问成功',1.23,2.83,3.02,.52,27,C.ink,{bold:true});txt(sl,'技术层能连通',1.24,3.60,2.98,.4,18,C.muted);card(sl,4.82,2.42,3.68,2.75,{fill:C.mint});txt(sl,'解析成功',5.11,2.83,3.02,.52,27,C.green,{bold:true});txt(sl,'标题 / 日期 / 正文',5.14,3.60,3.03,.4,18,C.muted);card(sl,8.71,2.42,3.68,2.75,{fill:C.pink});txt(sl,'允许使用？',9.0,2.83,3.02,.52,27,C.orange,{bold:true});txt(sl,'版权、许可、权益',9.02,3.60,2.98,.4,18,C.muted);txt(sl,'缺少明确授权时：保存候选与审查证据，不自动启用公开全文。',1.15,5.82,11.3,.52,18,C.ink,{bold:true});}
// 20 section
 divider('EDITORIAL ENGINE','AI 处理链，有边界','03 / PROCESS ENGINE','从原文到动态、热点与报告，每一步都应可解释。',C.green2);
// 21 pipeline
{
const sl=slide('PROCESS ENGINE');header(sl,'PIPELINE','系统不是一次问答，而是一条处理链','每个环节都应留下来源、结果和实际调用记录。');let s=['发现','去重','预筛','评分','摘要 / 标签','发布'];for(let i=0;i<6;i++){let x=.83+i*2.08;rect(sl,x,2.65,1.76,1.24,i%2?C.mint:C.white,.17,C.hair,.8);txt(sl,s[i],x+.10,2.95,1.57,.52,i===4?17:21,C.ink,{bold:true,align:'center'});if(i<5)arrow(sl,x+1.76,3.13);}line(sl,1.01,4.70,12.13,4.70,C.hair,2);txt(sl,'可追溯字段',.92,4.97,2.01,.43,18,C.green,{bold:true});txt(sl,'原始链接  /  发布日期  /  首次发现  /  模型回执  /  内容状态',3.27,4.97,8.44,.43,18,C.ink);}
// 22 time
{
const sl=slide('PROCESS ENGINE');header(sl,'TWO CLOCKS','“发布时间”与“发现时间”，不能互换','历史回填时，这个区别尤其重要。');const x=1.20,y=2.93;line(sl,x,y+1.33,12.10,y+1.33,C.hair,3);circ(sl,3.06,y+1.10,.47,C.orange);circ(sl,9.65,y+1.10,.47,C.green);txt(sl,'原始发布时间',1.73,y-.11,3.41,.44,23,C.orange,{bold:true,align:'center'});txt(sl,'来自发布网站',1.73,y+.52,3.41,.34,15,C.muted,{align:'center'});txt(sl,'系统发现时间',8.25,y-.11,3.45,.44,23,C.green,{bold:true,align:'center'});txt(sl,'来自首次抓取',8.25,y+.52,3.45,.34,15,C.muted,{align:'center'});card(sl,1.44,5.26,10.38,.72,{fill:C.pale});txt(sl,'不应把旧文章第一次被系统收录的日期显示成“刚刚发生”。',1.83,5.39,9.6,.48,19,C.ink,{bold:true});}
// 23 multi gate
{
let sl=slide('PROCESS ENGINE');header(sl,'QUALITY GATES','一条信息为什么能进入公开池？','技术抓取成功，只是开始。');let blocks=[{t:'技术有效',d:'标题、链接、日期',c:C.blue},{t:'公益相关',d:'规则与模型筛选',c:C.green},{t:'内容可用',d:'去重、摘要、溯源',c:C.orange},{t:'公开条件',d:'参与模式与可见性',c:C.gold}];blocks.forEach((a,i)=>{let x=.90+i*3.10;card(sl,x,2.64,2.74,2.90);rect(sl,x+.28,2.97,.44,.44,a.c,.12);txt(sl,String(i+1),x+.39,3.06,.24,.25,15,C.white,{bold:true});txt(sl,a.t,x+.28,3.81,2.17,.5,23,C.ink,{bold:true});txt(sl,a.d,x+.28,4.57,2.19,.50,16,C.muted);});smallCaption(sl,'selected 表示满足站内入选门槛，不等于事实准确率或法定认证。');}
// 24 dedupe
{
const sl=slide('PROCESS ENGINE');header(sl,'INDEPENDENCE','五条命中，不一定等于五份证据','转载、技术镜像与一手发布者，需要分开计数。');
let labs=['官网','RSS','搜索','公众号','媒体转载'];labs.forEach((t,i)=>{let x=.95+i*2.54;rect(sl,x,2.68,2.13,.85,C.white,.16,C.hair,.7);txt(sl,t,x+.14,2.88,1.83,.42,19,C.ink,{bold:true,align:'center'});line(sl,x+1.05,3.55,6.70,4.29,C.hair,1);});circ(sl,5.91,3.78,1.59,C.green);txt(sl,'原始\n发布主体',6.13,4.14,1.15,.73,20,C.white,{bold:true,align:'center'});txt(sl,'只对真正独立来源增加证据权重。',3.06,5.88,7.7,.42,20,C.ink,{bold:true,align:'center'});}
// 25 hotspot
{
const sl=slide('PROCESS ENGINE');header(sl,'EVENT TRACKING','热度，是辅助信号，不是事实判断','多个独立主体、近期进展等信号可帮助排序，但不能替代证据。');
card(sl,.87,2.53,7.22,3.33);txt(sl,'事件热度示意',1.21,2.85,4.1,.43,21,C.ink,{bold:true});const bars=[['独立来源',.83,C.green],['新鲜程度',.64,C.orange],['交叉证据',.53,C.blue]];bars.forEach((a,i)=>{let y=3.55+i*.64;txt(sl,a[0],1.24,y,1.80,.32,15,C.muted);rect(sl,3.2,y+.08,3.87,.18,C.hair,.09);rect(sl,3.2,y+.08,3.87*a[1],.18,a[2],.09)});card(sl,8.44,2.53,4.00,3.33,{fill:C.pink});txt(sl,'关键限制',8.77,2.97,3.35,.44,24,C.orange,{bold:true});txt(sl,'只有搜索信号、没有独立可信来源时，不应自动上榜。',8.78,3.82,3.17,1.11,18,C.ink);}
// 26 cycles
{
const sl=slide('PROCESS ENGINE');header(sl,'REPORT RHYTHM','日、周、月，不是三个复制粘贴的窗口','不同周期关注不同尺度的变化。');let data=[['日','及时发现','新增消息与短期进展',C.orange],['周','跟进主题','关键事件与发展线索',C.green],['月','复盘趋势','政策、项目与系统性变化',C.blue]];data.forEach((a,i)=>{let x=.87+i*4.22;card(sl,x,2.52,3.65,3.00);txt(sl,a[0],x+.28,2.79,1.08,.97,67,a[3],{bold:true});txt(sl,a[1],x+.32,4.03,2.95,.43,24,C.ink,{bold:true});txt(sl,a[2],x+.32,4.62,2.98,.54,16,C.muted);});}
// 27 divider
 divider('OPERATIONS','真正的难点，是长期运行','04 / OPERATIONS','模型、预算、队列和故障，必须有可核验的事实链。',C.gold);
// 28 stages
{
const sl=slide('OPERATIONS');header(sl,'MODEL STAGES','不同任务，可以由不同模型完成','不要把整个站简化成一个模型名称。');
const tasks=[['筛','预筛 / 相关性'],['评','评分 / 复核'],['析','结构 / 摘要'],['组','事件归组'],['写','周报 / 月报']];tasks.forEach((a,i)=>{let x=.71+i*2.57;card(sl,x,2.68,2.18,2.58);circ(sl,x+.64,2.97,.82,[C.blue,C.orange,C.green,C.gold,C.green2][i]);txt(sl,a[0],x+.84,3.13,.42,.35,22,C.white,{bold:true,align:'center'});txt(sl,a[1],x+.23,4.20,1.76,.70,17,C.ink,{bold:true,align:'center'});});rect(sl,.92,5.70,11.50,.62,C.pale,.14);txt(sl,'后台覆盖  >  阶段环境变量  >  默认模型；以实际回执为最终依据。',1.22,5.86,10.92,.38,18,C.ink,{bold:true});}
// 29 flash
{
let sl=slide('OPERATIONS');header(sl,'DEEPSEEK FLASH','迁移工具已经入库；生产生效仍须现场核实','“脚本存在”与“真实调用了该模型”，不是同一个结论。');
card(sl,.82,2.52,5.52,3.06,{fill:C.mint});txt(sl,'已完成',1.15,2.84,3.5,.38,17,C.green,{bold:true});txt(sl,'deepseek-flash',1.13,3.43,4.95,.54,29,C.ink,{bold:true});txt(sl,'默认示例 · 安全切换脚本 · 回滚方案',1.16,4.38,4.76,.56,16,C.muted);card(sl,6.71,2.52,5.69,3.06,{fill:C.pink});txt(sl,'待核验',7.06,2.84,4.2,.38,17,C.orange,{bold:true});txt(sl,'服务器与回执',7.04,3.43,4.96,.54,29,C.ink,{bold:true});txt(sl,'运行时 .env · 后台有效模型 · 新请求',7.05,4.38,4.89,.56,16,C.muted);smallCaption(sl,'原历史“PR #13”已迁为当前仓库 Issue #13 存档；不再将其误写成可访问的 Pull Request。');}
// 30 anydoor
{
let sl=slide('OPERATIONS');header(sl,'ROUTING RISK','免费池，可能悄悄变成付费调用','AnyDoor 应区分成功、超时、限流与收费回退。');
card(sl,.86,2.64,3.53,2.50,{fill:C.mint});txt(sl,'请求进入',1.23,3.02,2.78,.52,25,C.ink,{bold:true});txt(sl,'AnyDoor 多上游池',1.23,3.80,2.79,.45,17,C.green);arrow(sl,4.49,3.74);card(sl,5.07,2.64,3.41,2.50,{fill:C.white});txt(sl,'免费池成功？',5.40,3.02,2.72,.52,24,C.ink,{bold:true});txt(sl,'401 / 429 / 失败',5.43,3.81,2.53,.45,17,C.muted);arrow(sl,8.59,3.74,C.orange);card(sl,9.10,2.64,3.27,2.50,{fill:C.pink});txt(sl,'可能回退',9.42,3.02,2.64,.52,24,C.orange,{bold:true});txt(sl,'DeepSeek 产生费用',9.42,3.81,2.67,.45,17,C.ink);callout(sl,'判断是否省钱：看按阶段、服务商和模型统计的实际成功调用。',1.00,5.87,11.8);}
// 31 cost
{
const sl=slide('OPERATIONS');header(sl,'COST SNAPSHOT','历史近 30 日：模型与搜索合计约 ¥78','截至 2026-10-31；不是 11 月实时账单，不含服务器费用。');
numBox(sl,'¥66.02','模型估算',.89,2.55,5.65,{accent:C.green,extra:'49,904 次历史模型调用'});numBox(sl,'¥12.04','搜索估算',6.78,2.55,5.65,{accent:C.orange,extra:'2,407 次历史搜索调用'});rect(sl,.95,4.83,11.50,.38,C.hair,.16);rect(sl,.95,4.83,11.50*66.02/78.06,.38,C.green,.16);rect(sl,.95+11.50*66.02/78.06,4.83,11.50*12.04/78.06,.38,C.orange,.16);txt(sl,'合计 ¥78.06  ·  历史估算口径',1.00,5.60,10.65,.46,23,C.ink,{bold:true});smallCaption(sl,'后台估算未必等于服务商真实扣费；还需核对缓存、峰谷计费与失败重试。');}
// 32 budget
{
const sl=slide('OPERATIONS');header(sl,'BUDGET GUARDS','成本控制，首先是一套护栏','不要只问哪个模型更便宜，而不看什么时候该停止调用。');let rows=[['请求前','付费调用预算闸门','按分钟 / 小时 / 日控制'],['运行中','失败与限流熔断','避免重复撞付费接口'],['运行后','回执与可用产出对账','按篇、按阶段计算成本']];rows.forEach((r,i)=>{let y=2.51+i*1.19;card(sl,.90,y,11.54,1.02,{fill:i%2?C.pale:C.white});pill(sl,String(i+1).padStart(2,'0'),1.15,y+.34,.63,[C.mint,C.pink,C.pale][i],[C.green,C.orange,C.blue][i]);txt(sl,r[0],2.16,y+.25,2.13,.46,22,C.ink,{bold:true});txt(sl,r[1],4.06,y+.19,3.61,.5,21,C.ink);txt(sl,r[2],8.12,y+.30,3.70,.38,15,C.muted);});}
// 33 queue
{
const sl=slide('OPERATIONS');header(sl,'QUEUE HEALTH','要压住积压，不要压掉重要信息','新稿优先；历史稿有配额，归档不等于删除。');
card(sl,.93,2.54,3.48,2.88,{fill:C.mint});txt(sl,'01',1.22,2.88,1.21,.60,40,C.green,{bold:true});txt(sl,'新稿优先',1.22,3.75,2.95,.53,24,C.ink,{bold:true});txt(sl,'及时性',1.24,4.46,2.50,.36,16,C.muted);
card(sl,4.90,2.54,3.48,2.88);txt(sl,'02',5.20,2.88,1.21,.60,40,C.orange,{bold:true});txt(sl,'历史限额',5.20,3.75,2.95,.53,24,C.ink,{bold:true});txt(sl,'成本上界',5.22,4.46,2.50,.36,16,C.muted);
card(sl,8.87,2.54,3.48,2.88,{fill:C.pale});txt(sl,'03',9.17,2.88,1.21,.60,40,C.blue,{bold:true});txt(sl,'保留证据',9.17,3.75,2.95,.53,24,C.ink,{bold:true});txt(sl,'可回溯 / 可补编',9.19,4.46,2.50,.36,16,C.muted);smallCaption(sl,'需要看积压趋势、归档恢复机制与单位有效文章成本，而不是只看队列条数。');}
// 34 heartbeat
{
let sl=slide('OPERATIONS');header(sl,'DIAGNOSIS','页面停更，不等于 worker 已挂','先确认处在哪一层，再决定怎么修。');
let rows=[['API / Worker','健康心跳','是否仍正常运行？',C.green],['采集任务','到期源与错误','数据有没有进来？',C.blue],['处理队列','pending / completed','是否在积压或限流？',C.orange]];rows.forEach((r,i)=>{let y=2.49+i*1.22;card(sl,.91,y,11.46,1.06);circ(sl,1.17,y+.38,.20,r[3]);txt(sl,r[0],1.72,y+.28,2.82,.46,23,C.ink,{bold:true});txt(sl,r[1],5.01,y+.28,2.55,.46,20,r[3],{bold:true});txt(sl,r[2],8.24,y+.32,3.71,.41,16,C.muted);});}
// 35 quality
{
const sl=slide('OPERATIONS');header(sl,'HUMAN REVIEW','机器可以初筛，质量仍需抽样复核','至少覆盖政策、司法、机构项目、国际研究和搜索热点。');let fields=[['政策','发布时间'],['司法','案例事实'],['项目','主体独立'],['研究','摘要准确'],['搜索','误报漏报']];fields.forEach((a,i)=>{let x=.82+i*2.55;card(sl,x,2.72,2.11,2.74,{fill:i%2?C.pale:C.white});txt(sl,String(i+1).padStart(2,'0'),x+.28,3.06,1.12,.50,32,[C.green,C.blue,C.orange,C.gold,C.green2][i],{bold:true});txt(sl,a[0],x+.28,3.85,1.66,.47,25,C.ink,{bold:true});txt(sl,a[1],x+.30,4.53,1.60,.40,15,C.muted);});smallCaption(sl,'样本与标签标准是下一阶段人工验证计划，不能冒称质量评测已经完成。');}
// 36 divider
 divider('HANDOFF & ROADMAP','项目要能被下一位接手','05 / HANDOFF','材料可再生、证据可核查、生产变更可回滚。',C.orange);
// 37 three levels
{
const sl=slide('HANDOFF');header(sl,'EVIDENCE TIERS','项目事实，要放在三个不同的抽屉','代码不证明已经上线，日志估算不证明实付。');let rows=[{n:'01',t:'GitHub',v:'代码与模板',s:'说明设计和可实现能力',c:C.green},{n:'02',t:'生产环境',v:'部署与数据库',s:'说明现场实际运行状态',c:C.blue},{n:'03',t:'外部供应商',v:'调用回执与账单',s:'说明真正发生的费用',c:C.orange}];rows.forEach((a,i)=>{let y=2.48+i*1.22;card(sl,.89,y,11.56,1.09,{fill:i%2?C.pale:C.white});pill(sl,a.n,1.18,y+.38,.61,a.c,C.white,11);txt(sl,a.t,2.11,y+.26,2.82,.50,24,C.ink,{bold:true});txt(sl,a.v,5.21,y+.28,3.04,.47,20,a.c,{bold:true});txt(sl,a.s,8.44,y+.30,3.62,.43,15,C.muted);});}
// 38 docs architecture
{
const sl=slide('HANDOFF');header(sl,'SINGLE SOURCE','写下一切，但不要把 README 写成一本书','不同材料，有不同的职责。');let data=[['README','入口 / 产品定位',C.orange],['25 章报告','完整使用与交接',C.green],['MAINTENANCE','技术操作与历史故障',C.blue],['证据记录','运行态与账单核验',C.gold]];data.forEach((a,i)=>{let x=.79+i*3.18;card(sl,x,2.57,2.76,2.82,{fill:i%2?C.pale:C.white});rect(sl,x+.26,2.94,.45,.46,a[2],.11);txt(sl,String(i+1),x+.37,3.04,.24,.26,15,C.white,{bold:true});txt(sl,a[0],x+.24,3.86,2.25,.44,i===2?20:23,C.ink,{bold:true});txt(sl,a[1],x+.25,4.57,2.24,.47,14,C.muted);});smallCaption(sl,'培训文稿、Word 和 PPT 可由仓库源文件再生；旧聊天的附件不应是唯一事实源。');}
// 39 roadmap
{
const sl=slide('HANDOFF');header(sl,'NEXT 30 DAYS','未来一个月，只抓最重要的闭环','保活 → 可信基线 → 质量评估 → 可以交接。');const blocks=[['第 1 周','保活与对账','信源 / 模型 / 队列',C.green],['第 2 周','人工质量抽样','正确性 / 日期 / 去重',C.blue],['第 3 周','成本与可靠性','回退 / 备份 / 邮件',C.orange],['第 4 周','完善交接资产','运营主体 / 培训 / 文档',C.gold]];blocks.forEach((a,i)=>{let x=.79+i*3.16;card(sl,x,2.50,2.83,3.22);rect(sl,x,2.50,2.83,.12,a[3],.05);txt(sl,a[0],x+.23,2.92,2.4,.36,16,a[3],{bold:true});txt(sl,a[1],x+.23,3.64,2.45,.50,24,C.ink,{bold:true});line(sl,x+.24,4.52,x+2.55,4.52,C.hair,1);txt(sl,a[2],x+.25,4.78,2.29,.65,15,C.muted);});}
// 40 closing
{
const sl=slide('END NOTE',{dark:true});rect(sl,.0,.0,.14,H,C.orange);pill(sl,'YIHOT · CONTINUE WITH EVIDENCE',.84,.70,3.90,'24464D','C2DBD2',11);
txt(sl,'值得长期维护的，',.79,1.60,11.5,.87,43,C.white,{bold:true});txt(sl,'不是更多数字。',.79,2.63,11.5,.87,48,'A1D1BD',{bold:true});txt(sl,'而是一套经得起核验、能够持续交接的公益信息系统。',.83,4.01,10.3,.90,25,C.white,{bold:true});line(sl,.83,5.24,11.8,5.24,'3D5860',1);txt(sl,'README  →  25 章报告  →  生产证据核验  →  下一轮真实更新',.85,5.64,11.7,.58,16,'A8C3BB');circ(sl,11.03,1.71,2.45,C.orange,undefined,0,6);circ(sl,11.55,2.65,1.67,C.green2,undefined,0,32);}
if(num!==40) throw new Error('Expected 40, got '+num);
pptx.writeFile({fileName:'docs/archive/YiHot_Editorial_Redesign_40_Slides_2026-11-11.pptx'}).then(()=>console.log('Wrote 40 slides')).catch(err=>{console.error(err);process.exit(1)});