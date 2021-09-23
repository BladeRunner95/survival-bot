const {Telegraf} = require('telegraf')
const Markup = require('telegraf/markup')
const Extra = require('telegraf/extra')
const session = require('telegraf/session')
const Stage = require('telegraf/stage')
const WizardScene = require('telegraf/scenes/wizard')
const axios = require('axios');
const env = process.env;
const fetch = require("node-fetch");
require('dotenv').config()


const bot = new Telegraf(env.BOT_TOKEN);

let keyboards = Markup.keyboard([
    ['Create Expense 💰'],
    ['Expenses 📝'],
    ['History 📜']
])
    .resize()
    .extra()

//initiate bot and save group id
bot.start((ctx) => {
    let data= {
        groupId: ctx.message.chat.id
    };

    axios.get('http://localhost:4000/api/groups').then(res => {
        let thisGroup = res.data.filter(singleGroup => singleGroup.groupId === ctx.message.chat.id);
        if (thisGroup.length > 0) {
            ctx.reply('The bot is already added to this group');
        } else {
            axios.post('http://localhost:4000/api/groups', data).then(res => {
                ctx.reply('You initiated a bot', keyboards);
            }).catch(err => console.log(err))
        }
    })
})

let partArr = [];

axios.get(`http://localhost:4000/api`)
    .then(res => {
    })
    .catch(err => console.log(err))


const superWizard = new WizardScene('super-wizard',
    (ctx) => {
        let single = [];
        let usersIds = [];
        let usernames = [];
        axios.get(`http://localhost:4000/api/groups/${ctx.message.chat.id}/users`).then(res => {
            res.data.forEach(user => single.push(user) + usersIds.push(user.userId) + usernames.push(user.username));
            ctx.wizard.state.data.allNames = single;
            ctx.wizard.state.data.allUsersId = usersIds;
            ctx.wizard.state.data.allUsersNames = usernames;
        });

        ctx.reply('Step 1, Create name', Markup.keyboard([
                ['Cancel']
            ])
                .oneTime()
                .resize()
                .extra()
        )
        //there might be an issue because of async above
        ctx.wizard.state.data = {};
        return ctx.wizard.next();
    },
    //step 2
    async (ctx) => {
        ctx.wizard.state.data.name = ctx.message.text;
            if (ctx.message.text === 'Cancel') {
                ctx.reply('Main menu', keyboards);
                partArr= [];
                return ctx.scene.leave();
            } else {
                //Adding array of users as buttons
                // ctx.wizard.state.data.allNames = single;
                let buttons = [
                    ['All'],
                ]
                ctx.wizard.state.data.allNames.forEach(
                    name =>{
                        //переделать с юзернейма на объект с айди
                            if (!partArr.some(addedPart => name.username.includes(addedPart))) {
                                buttons.push([name.username]);
                            }
                        }
                    )
                buttons.push(['Next', 'Cancel']);
                if (ctx.wizard.state.data.name !== 'Back') {
                    ctx.reply(` Step 2, You created an expense: ${ctx.wizard.state.data.name}`)
                    ctx.reply(` Please add participants`, Markup
                        .keyboard(buttons)
                        .resize()
                        .oneTime()
                        .extra()
                    );
                    return ctx.wizard.next();
                } else {
                    ctx.reply(` Step 2, You created an expense: ${ctx.wizard.state.data.name}`)
                }
                ctx.reply(` Please add participants`, Markup
                    .keyboard(buttons)
                    .oneTime()
                    .resize()
                    .extra()
                );
                return ctx.wizard.next();
            }
    },
    //step 3
    (ctx) => {
        ctx.wizard.state.data.participants = ctx.message.text;
        // HANDLE CANCEL BUTTON //
        if (ctx.message.text === 'Cancel') {
            ctx.reply('Main menu:', keyboards);
            partArr=[];
            return ctx.scene.leave();
        }
        //Handle Next button (when finish adding participants)
        else if (ctx.message.text === 'Next') {
            ctx.wizard.state.data.participants = partArr;
            ctx.reply(` Please add amount`, Markup
                .keyboard([
                    ['Cancel']
                ])
                .oneTime()
                .resize()
                .extra()
            );
            return ctx.wizard.next();
        }
        // HANDLE BACK BUTTON
        else {
            if (ctx.message.text !== "Back") {
                if (ctx.message.text === "All") {
                    ctx.wizard.state.data.participants = ctx.wizard.state.data.allUsersNames;
                    ctx.wizard.state.data.allNames.forEach(participant=> partArr.push(participant));
                    ctx.reply(` Step 3, You selected participants: ${ctx.wizard.state.data.participants}`)
                    ctx.reply(` Please add amount`, Markup
                        .keyboard([
                            ['Cancel']
                        ])
                        .oneTime()
                        .resize()
                        .extra()
                    );
                    return ctx.wizard.next();
                    //probably need to delete next else if as it is extra
                } else if (ctx.message.text.includes("Add")) {
                    ctx.reply(`You choose ${ctx.wizard.state.data.participants}`)
                    ctx.message.text = ctx.wizard.state.data.name;
                    ctx.wizard.cursor = 1;
                    return ctx.wizard.steps[1](ctx);
                }
                // Handler for adding users one by one  (else means if not All...)
                else {
                    if (partArr.includes(ctx.wizard.state.data.participants)) {
                        ctx.reply(`${ctx.wizard.state.data.participants} Already added`)
                        ctx.message.text = ctx.wizard.state.data.name;
                        ctx.wizard.cursor = 1;
                        return ctx.wizard.steps[1](ctx);
                    } else {
                        partArr.push(ctx.wizard.state.data.participants)
                        ctx.reply(` Step 3, You selected participants: ${partArr}`);
                        ctx.message.text = ctx.wizard.state.data.name;
                        ctx.wizard.cursor = 1;
                        return ctx.wizard.steps[1](ctx);
                    }
                }
            }
            ctx.message.text = ctx.wizard.state.data.name;
            ctx.wizard.cursor = 1;
            return ctx.wizard.steps[1](ctx);
        }
    },
    (ctx) => {
        // HANDLE CANCEL BUTTON //
        if (ctx.message.text === 'Cancel') {
            ctx.reply('Main menu:', keyboards);
            partArr= [];
            return ctx.scene.leave();
        }
        // HANDLE BACK BUTTON
        else {
            ctx.wizard.state.data.amount = ctx.message.text;
            ctx.wizard.state.data.creator = ctx.from.id;
            ctx.wizard.state.data.createdBy = ctx.from.username
            const isNum = /^\d+$/.test(ctx.wizard.state.data.amount);
            if (isNum) {
                let fromEach = ctx.wizard.state.data.amount / ctx.wizard.state.data.participants.length;
                    // Следующий реплай должен идти после успешного добавления платежа в бд
                let date = Date.now();
                let data = {
                    name: ctx.wizard.state.data.name,
                    participants: ctx.wizard.state.data.participants.flat(),
                    amount: ctx.wizard.state.data.amount,
                    fromEach,
                    creatorId: ctx.wizard.state.data.creator,
                    creatorName: ctx.wizard.state.data.createdBy,
                    notPaid: ctx.wizard.state.data.participants.flat(),
                    isClosed: false,
                    createdAt: new Date(date).toDateString()
                };
                axios.post(`http://localhost:4000/api/groups/${ctx.message.chat.id}/expenses`,data).then(
                    res=> {
                        ctx.reply(
                            `
                    ${ctx.from.first_name} Just created a new expense
                    Expense: ${ctx.wizard.state.data.name}
                    Participants: ${ctx.wizard.state.data.participants.join(', ')}
                    Amount: ${ctx.wizard.state.data.amount}
                    From each: ${Math.round(fromEach)}`,
                            keyboards)
                        //cleanup array
                        partArr = [];
                        return ctx.scene.leave()
                    }
                ).catch(err => console.log(err));
            } else {
                ctx.reply('Not a number')
                ctx.message.text = 'Next';
                ctx.wizard.cursor = 2;
                return ctx.wizard.steps[2](ctx);
            }

        }
    },
)

const stage = new Stage([superWizard])
bot.use(session())
bot.use(stage.middleware())
bot.hears('id', ctx => {
    ctx.reply(`Your id: ${ctx.from.id} \nYour username: ${ctx.from.username}`);
})

bot.hears('Create Expense 💰', Stage.enter('super-wizard'))


bot.hears('Expenses 📝', (ctx) => {
    axios.get(`http://localhost:4000/api/groups/${ctx.message.chat.id}/expenses`).then(
        res => {
            if (res.data.length > 0) {
                {
                    const userExpenses = res.data.filter(filteredExpense => filteredExpense.participants.includes(ctx.from.username)
                        && filteredExpense.isClosed === false && filteredExpense.notPaid.includes(ctx.from.username))
                    //show only my expenses
                    if (userExpenses.length > 0) {
                        userExpenses.forEach((singleExpense, index) => {
                            bot.action(`settle up ${singleExpense._id}`, (ctx) => {
                                let data = {
                                    notPaid: singleExpense.notPaid.filter(singleNotPaid => singleNotPaid !== ctx.from.username)
                                }
                                axios.put(`http://localhost:4000/api/expenses/${singleExpense._id}`, data).then(
                                    res => {
                                    }).catch(err=> console.log(err));
                                ctx.editMessageText('<i>You settled</i>',
                                    Extra.HTML())
                            });
                                bot.action(`close expense ${singleExpense._id}`, (ctx) => {
                                    let data = {
                                        isClosed : true
                                    }
                                    axios.put(`http://localhost:4000/api/expenses/${singleExpense._id}`, data).then(
                                        res => {
                                        }).catch(err=> console.log(err));
                                    ctx.editMessageText(`<i>The expense is closed</i>`,
                                        Extra.HTML())
                                });
                            return ctx.reply(`Expense ${++index}: ` +
                                '\n' + 'Name: ' + singleExpense.name +
                                '\n' + 'Participants: ' + singleExpense.participants.join(', ') +
                                '\n' + 'Amount: ' + singleExpense.amount +
                                '\n' + 'From Each: ' + Math.round(singleExpense.fromEach) +
                                '\n' + 'Created by: ' + singleExpense.creatorName +
                                '\n' + 'Not paid: ' + ((singleExpense.notPaid.filter(participant => participant !== singleExpense.creatorName)).length > 0 ?
                                    singleExpense.notPaid.filter(participant => participant !== singleExpense.creatorName)
                                    : 'Everyone paid'),
                                ctx.message.from.id === singleExpense.creatorId ?
                                    Extra.HTML()
                                        .markup(Markup.inlineKeyboard([
                                            Markup.callbackButton(`Close expense`, `close expense ${singleExpense._id}`)
                                        ])) :
                                    Extra.HTML()
                                        .markup(Markup.inlineKeyboard([
                                            Markup.callbackButton('Settle up', `settle up ${singleExpense._id}`)
                                        ]))
                            )
                        })
                    } else {
                        ctx.reply('You do not have any active expenses');
                    }
                }
            } else {
                ctx.reply('No current expenses');
            }
        }
    ).catch(err=>console.log(err));
})

bot.hears('History 📜', (ctx) => {
    axios.get(`http://localhost:4000/api/groups/${ctx.message.chat.id}/expenses`).then(
        res => {
            if (res.data.length > 0) {
                {
                    const userExpenses = res.data.filter(filteredExpense => filteredExpense.participants.includes(ctx.from.username))
                    //show only my expenses
                    if (userExpenses.length > 0) {
                        ctx.reply(`${userExpenses.map((singleExpense, index) => {
                            return ('Expense' + ++index + ":" + '\n' + 'Name: ' + singleExpense.name +
                                '\n' + 'Participants: ' + singleExpense.participants.join(', ') +
                                '\n' + 'Amount: ' + singleExpense.amount +
                                '\n' + 'From Each: ' + Math.round(singleExpense.fromEach) +
                                '\n'+ 'Created by: ' + singleExpense.creatorName +
                                '\n' + 'Status: ' + (singleExpense.isClosed ? 'Closed' : 'Active') +
                                '\n' + 'Created at: ' + singleExpense.createdAt)
                        }).join('\n ----------------\n')}`)
                    } else {
                        ctx.reply('No expenses created');
                    }
                }
            } else {
                ctx.reply('No expenses created');
            }
        }
).catch(err=> console.log(err));
})

bot.hears('Meme', (ctx) => {
    fetch('https://meme-api.herokuapp.com/gimme').then(
        res => res.json().then(data=> ctx.replyWithPhoto({
            url: data.preview[3],
            filename: 'kitten.jpg'
        }))
    ).catch(err=> {ctx.reply('the meme is broken, try again') })
})

bot.hears('Join', (ctx => {
        let data = {
            userId: ctx.message.from.id,
            username: ctx.message.from.username
        };

        //check in db if I added to current group and add me if I'm not added yet
        axios.get(`http://localhost:4000/api/groups/${ctx.message.chat.id}/users`).then(res => {
            let onlyMe = res.data.filter(v => v.userId === ctx.message.from.id);
            if (onlyMe.length > 0) {
                ctx.reply('Already added');

            } else {
                axios.post(`http://localhost:4000/api/groups/${ctx.message.chat.id}/users`, data).then(res => {
                    ctx.reply('You are added to the bot');
                }).catch(err => console.log(err))
            }

        })
    })
)


bot.on(['sticker', 'photo'], (ctx) => {
    return ctx.reply('This is a Sticker or photo');
})


bot.launch()