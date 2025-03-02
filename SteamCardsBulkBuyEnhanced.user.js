// ==UserScript==
// @name            Steam Trading Cards Bulk Buyer (Enhanced)
// @version         1.1.4
// @description     A free userscript to purchase remaining cards needed for a maximum level badge in bulk
//
// @copyright       Contains parts of the Steam Trading Cards Bulk Buyer script © 2013 - 2015 Dr. McKay
// @copyright       Contains parts of the Steam-TradingCardsBulkBuyerMAX script © 2018 Zhiletka
// @license         MIT
//
// @icon            https://icons.iconarchive.com/icons/papirus-team/papirus-apps/48/steam-icon.png
//
// @match           *://steamcommunity.com/*/gamecards/*
// @require         https://ajax.googleapis.com/ajax/libs/jquery/2.0.3/jquery.min.js
// @grant           GM_info
// ==/UserScript==

$.ajaxSetup({
    cache: false,
    xhrFields: {
        withCredentials: true
    }
});

var g_Now = Date.now();
var g_StatusSeparator = " - ";
var g_SessionID;

var g_Name = GM_info.script.name + g_StatusSeparator + 'v' + GM_info.script.version;

// Current currency (numerical identifier used by Steam)
var g_Currency = 1;

// Initialize default currency information
var g_CurrencyInfo = {
    symbol_prefix: "",
    symbol_suffix: "",
    separator: "."
};

// Default history analyze range
var g_HistoryRangeDays = 7;

// Initialize default badge settings
var g_BadgeLevel = 0;
var g_BadgeMaxLevel = 5;
var g_IsSaleBadge = false;
var g_ShowedBadgeLevel = 0;
var g_IsFoil = false;

// Messages
var g_Messages = {
    error_cannot_buy: 'Cannot buy now (No sellers or card has expired)',
    error_no_listings: 'There are no listings for this item',
    error_not_logged_in: 'Not logged in', 
    error_get_histogram: 'Failed to get item orders histogram',
    error_get_price_history: 'Failed to get item price history',
    error_get_buy_order_status: 'Cannot get buy order status',
    status_placing_order: 'Placing buy order...',
    status_loading: 'Loading...',
    status_purchased: 'Purchased',
    status_placed: 'Order placed',
    status_checking: 'Checking order status...',
    status_canceling: 'Canceling active order...',
};

// App IDs for Steam sale badge
// Should be updated for each sale
var g_SaleBagdeIds = [
    2861720, /* Winter Sale 2024 */              
]

// Colors
var g_Colors = {
    green: 'LimeGreen',
    red: 'FireBrick',
    gold: 'Gold'
}

// UI settings
var TITLE = '<div class="badge_title_rule"/><div class="badge_title">' + g_Name + '</div><br/>';
var PANEL; // object to hold #bb_panel

$(document).ready(function() {
    // Ensure that the page is loaded in HTTPS (Issue #19)
    if (document.location.protocol != 'https:') {
        let badgePageUrl = window.location.href;
        window.location.href = badgePageUrl.replace('http://', 'https://');
    }
});

if ($('.badge_card_set_card').length && $('.badge_info').length) {
    // Get current badge level
    if ($('.badge_info_unlocked').length) {
        g_BadgeLevel = parseInt($('meta[property="og:description"]').attr('content').match(/\d+/), 10);
    }
    
    // Set max level to 1 for a Foil badge
    if (document.documentURI.includes('border=1')) {
        g_BadgeMaxLevel = 1;
        g_IsFoil = true;
    }

    // Detect Steam Sale badge
    let appId = document.documentURI.match(/gamecards\/(\d+)/)[1];
    if($('.badge_title').text().match(/\s*(Winter|Summer) Sale \d+ Badge\s*/) || 
            $('.badge_title').text().match(/\s*(Winter|Summer) Sale \d+ Foil Badge\s*/) ||
            g_SaleBagdeIds.includes(parseInt(appId))) {
            g_BadgeMaxLevel = g_BadgeLevel + 1;
            g_IsSaleBadge = true;
    }

    $('.badge_detail_tasks:first').append('<div style="margin: 10px"><div id="bb_panel" style="visibility: hidden; margin-top: 5px"/></div>');
    PANEL = $('#bb_panel');
    g_ShowedBadgeLevel = g_BadgeMaxLevel;
    updatePrices();

    // We have to do this visibility/display thing in order for offsetWidth to work
    PANEL.css({display: 'none', visibility: 'visible'}).show('blind');
}

function _bottomLayout(w) {
    let _total_label = '<br/><b><span style="display: inline-block; width: ' + w + 'px;' +
                    'padding-right: 10px; text-align: right">TOTAL</span><span id="bb_totalprice"/><span id="bb_old_totalprice" style="padding-left: 10px;"/></b><br/>';
    let _history_slider = '<span id="bb_historyrange"><span style="padding-left: 30px; padding-right: 10px">' +
                    'History analyze range</span><input type="range" id="bb_rangeslider" style="vertical-align: middle; width: 30%"/>' +
                    '<span id="bb_slidervalue" style="padding-left: 10px"/></span><br/>';

    let _place_orders = '<br/><button type="button" id="bb_placeorders" class="btn_green_white_innerfade btn_medium_wide" style="padding: 10px 20px">' +
                    'PLACE ORDERS</button><br/></div>';
    
    let _buy_now = '<div id="bb_controls"><br/><label><input type="checkbox" id="bb_changemode" style="margin-left: 0;' +
                'margin-right: 10px; vertical-align: middle; position: relative; top: -1px"/>BUY NOW</label>';

    return _total_label + _buy_now + _history_slider + _place_orders;
}

function _chooseMaxLevel(level) {
    g_ShowedBadgeLevel = level;
    return '<div class="bb_next_lvl" style="margin-bottom: 5px;">' + 
           '<span style="padding-right: 10px; font-size: 18px;">Your max level</span>' +
           '<input id="bb_lvl_box" type="number" min="1" value=' + level + 
           ' style="padding-left: 10px; width: 60px; height: 20px; font-size: 18px; width: 6ch;"></div></br>';
}

function updatePrices() {
    PANEL.html('');

    Array.prototype.slice.call($('.badge_card_set_card')).forEach(function(card) {
        card = $(card);

        var cardText = card.find('.badge_card_set_text')[0].textContent;
        var quantity = cardText.match(/\((\d+)\)\r?\n|\r/);
        if (quantity) {
            quantity = parseInt(quantity[1], 10);
            cardText = cardText.substring(cardText.indexOf(')') + 1);
        } else {
            quantity = 0;
        }
        quantity = (g_ShowedBadgeLevel - g_BadgeLevel) - quantity;
        if (quantity < 1) {
            return;
        }

        if (PANEL.html().length == 0) {
            PANEL.append(TITLE);
            PANEL.append(_chooseMaxLevel(g_ShowedBadgeLevel));
        }

        var cardName = cardText.replace(/\t|\r?\n|\r/g, '');

        var row = $('<div class="bb_cardrow" style="padding-bottom: 3px; opacity: 0.4"><label>' +
                '<input class="bb_cardcheckbox" type="checkbox" style="margin: 0; vertical-align: bottom; position: relative; top: -1px"' +
                'checked/><span class="bb_cardname" style="padding-right: 10px; text-align: right; display: inline-block; font-weight: bold">' + 
                cardName + ' (' + quantity + ')</span></label><span class="bb_cardprice" data-name="' + cardName.replace(/"/g, '&quot;') + '"/></div>');

        PANEL.append(row);
        row.data('quantity', quantity);
        setCardStatus(row, g_Messages.status_loading);

        var appID = document.documentURI.match(/gamecards\/(\d+)/);
        var cardPageUrl = 'https://steamcommunity.com/market/listings/753/' + appID[1] + '-' + encodeURIComponent(cardName);
        
        if(g_IsFoil) {
            cardPageAjaxRequest([cardPageUrl + ' (Foil Trading Card)', cardPageUrl + ' (Foil)']);
        }
        else {
            cardPageAjaxRequest([cardPageUrl + ' (Trading Card)', cardPageUrl]);
        }

        function cardPageAjaxRequest(urls) {
            if (urls.length == 0) {
                setCardStatusError(row, g_Messages.error_no_listings);
                return;
            }
            let url = urls.pop();
            $.get(url).done(function(html) {
                var marketID = html.match(/Market_LoadOrderSpread\(\s*(\d+)\s*\);/);
                var sessionID = html.match(/g_sessionID = "(.+)";/);
                var countryCode = html.match(/g_strCountryCode = "([a-zA-Z0-9]+)";/);
                var currency = html.match(/"wallet_currency":(\d+)/);
                var hashName = html.match(/"market_hash_name":"((?:[^"\\]|\\.)*)"/);
                var oldOrderID = html.match(/CancelMarketBuyOrder\(\D*(\d+)\D*\)/);

                if (!currency || !countryCode) {
                    setCardStatusError(row, g_Messages.error_not_logged_in);
                    return;
                }

                if (!marketID || !sessionID || !hashName) {
                    return cardPageAjaxRequest(urls);
                }

                g_Currency = currency[1];
                g_SessionID = sessionID[1];

                hashName[1] = decodeURIComponent(JSON.parse('"' + hashName[1] + '"'));
                $.get('/market/itemordershistogram', 
                    {"country": countryCode[1], language: 'english', "currency": g_Currency, "item_nameid": marketID[1]}).always(function(histogram) {

                    if (!histogram || !histogram.success) {
                        setCardStatusError(row, g_Messages.error_get_histogram);
                        return;
                    }

                    if (histogram.price_prefix) {
                        g_CurrencyInfo.symbol_prefix = histogram.price_prefix;
                    } else {
                        g_CurrencyInfo.symbol_suffix = histogram.price_suffix;
                    }

                    [[histogram.buy_order_graph, histogram.highest_buy_order, histogram.buy_order_summary], 
                        [histogram.sell_order_graph, histogram.lowest_sell_order, histogram.sell_order_summary]].forEach(function(array) {
                        if (!array[0].length && array[1]) {
                            let s = new DOMParser().parseFromString(array[2], 'text/html').documentElement.textContent;
                            let p = s.match(/(\d+)\D*([\d.]+)/);
                            array[0].push([Number(p[2]), Number(p[1]), s]);
                        }
                    });

                    $.get('/market/pricehistory', {"appid": 753, "market_hash_name": hashName[1]}).always(function(history) {
                        if (history && history.success && history.prices) {
                            for (let i = 0; i < history.prices.length; i++) {
                                history.prices[i][0] = Date.parse(history.prices[i][0]);
                                history.prices[i][2] = parseInt(history.prices[i][2], 10);
                                history.prices[i][1] *= 100;
                            }
                        }
                        
                        row.data('hashname', hashName[1]);
                        row.data('histogram', histogram);
                        row.data('history', history);

                        var price = getOptimumPrice(histogram, history, quantity);
                        row.data('price_total', price[0] * quantity);

                        row.data('old_price', 0);

                        if (oldOrderID) {
                            let oldOrderData = _oldOrderData(html, countryCode[1]);
                            row.data('old_orderid', oldOrderID[1]);
                            row.data('old_orderdata', ' <span style="opacity: 0.5"><strike>' + 
                                oldOrderData[0] + ' x ' + oldOrderData[1] + ' (' + priceToString(oldOrderData[2]) + ') ordered</strike></span>');
                            row.data('old_price', oldOrderData[1]);
                        }

                        setCardStatus(row, priceToString(price[0] * quantity - price[1], true) + g_StatusSeparator + 
                                price[2] + (row.data('old_orderdata') ? row.data('old_orderdata') : ''));
                        row.css('opacity', 1);

                        row.addClass('ready');
                        
                        if ($('.bb_cardrow:not(.ready)').length === 0) {
                            let w = $('.bb_cardprice:first').offset().left - $('.bb_cardrow:first').offset().left - 10;
                            $('#bb_panel').append(_bottomLayout(w));

                            let t_oldest, t_latest;
                            for (let i = 0, cards = $('.bb_cardrow'); i < cards.length; i++) {
                                let prices = $(cards[i]).data('history').prices;
                                if (prices && prices.length) {
                                    t_oldest = Math.min(prices[0][0], t_oldest || Number.MAX_VALUE);
                                    t_latest = Math.max(prices[prices.length-1][0], t_latest || 0);
                                }
                            }

                            if (t_oldest && t_latest) {
                                t_oldest = Math.round((g_Now - t_oldest) / 86400000);
                                t_latest = Math.round((g_Now - t_latest) / 86400000);
                                g_HistoryRangeDays = Math.min(t_oldest, g_HistoryRangeDays);

                                $('#bb_slidervalue').text(g_HistoryRangeDays + ' days');
                                $('#bb_rangeslider').prop({min: t_latest, max: t_oldest, value: g_HistoryRangeDays});
                                $('#bb_rangeslider').on('input change', function() {
                                    g_HistoryRangeDays = $(this).val();
                                    $('#bb_slidervalue').text(g_HistoryRangeDays + ' days');
                                    $('#bb_changemode').change();
                                });
                            } else {
                                $('#bb_historyrange').css('display', 'none');
                            }

                            $('#bb_lvl_box').change(function() {
                                let level = document.getElementById("bb_lvl_box").value;
                                if (g_IsSaleBadge) {
                                    if(level <= g_BadgeMaxLevel) {
                                        document.getElementById("bb_lvl_box").value = g_BadgeMaxLevel;
                                        return;
                                    }
                                    g_BadgeMaxLevel = level;
                                } else {
                                    if(level < (g_BadgeLevel + 1) || level > g_BadgeMaxLevel) {
                                        document.getElementById("bb_lvl_box").value = g_BadgeMaxLevel;
                                        return;
                                    }                                    
                                }
                                g_ShowedBadgeLevel = level;
                                updatePrices();
                            });

                            $('#bb_changemode').change(function() {
                                var total = 0;
                                var old_total = 0;
                                var fail_count = 0;
                                var skip_count = 0;
                                var card_num = 0;
                                document.getElementById('bb_placeorders').style.visibility = 'visible';
                                
                                for (let i = 0, cards = $('.bb_cardrow'); i < cards.length; i++) {
                                    let card = $(cards[i]);
                                    if (card.hasClass('error')) {
                                        card.removeClass('error');
                                        card.find('.bb_cardcheckbox').prop({checked: true, disabled: false});
                                        if(card.hasClass('skip')) {
                                            card.find('.bb_cardcheckbox').prop({checked: false});
                                        }
                                    }
                                    card_num++;
                                    if (card.hasClass('skip')) {
                                        skip_count++;
                                    }
                                    
                                    let quantity = card.data('quantity');
                                    let price = (this.checked ? getImmediatePrice : getOptimumPrice)(card.data('histogram'), card.data('history'), quantity);
                                    
                                    if (this.checked && price[2] !== 'OK') {
                                        if (!card.hasClass('skip')) {
                                            setCardStatusError(card, g_Messages.error_cannot_buy);
                                            fail_count++;
                                            continue;
                                        }
                                    }
                                    // Current order is not highest order, increase price
                                    if (price[2] == 'Highest buy order') {
                                        if(card.data('old_price') !== (parseInt(price[0]) / 100).toFixed(2)) {
                                            price[0] += 1;
                                        }
                                    }

                                    card.data('price_total', price[0] * quantity);
                                    let price_info = priceToString(price[0] * quantity - price[1], true) + g_StatusSeparator + 
                                                        price[2] + (card.data('old_orderdata') ? card.data('old_orderdata') : '');
                                    setCardStatus(card, price_info);
                                    let new_price = price[0] * quantity - price[1];
                                    let old_price = Number(card.data('old_price')) * quantity;
                                    if(old_price === parseInt(new_price, 10) / 100) {
                                        card.find('.bb_cardcheckbox').prop({checked: false});
                                    } else {
                                        card.find('.bb_cardcheckbox').prop({checked: true});
                                    }

                                    if (card.find('.bb_cardcheckbox').is(':checked')) {
                                        total += new_price;
                                        old_total += old_price;
                                        card.removeClass('skip');
                                        card.css('opacity', 1);
                                    } else {
                                        if (!card.hasClass('skip')) {
                                            card.addClass('skip');
                                            card.css('opacity', 0.4);
                                        }
                                    }
                                }

                                if (fail_count > 0 && (fail_count + skip_count) == card_num) {
                                    document.getElementById('bb_placeorders').style.visibility = 'hidden';
                                }
                                else {
                                    document.getElementById('bb_placeorders').style.visibility = 'visible';
                                }

                                $('#bb_totalprice').text(priceToString(total, true));

                                let new_total = parseInt(total, 10) / 100;
                                let sign = new_total >= old_total ? '+' : '-';
                                let color = new_total > old_total ? g_Colors.red : g_Colors.green;
                                $('#bb_old_totalprice').text('(' + sign + priceToString(Math.abs(new_total-old_total)) + ')');
                                $('#bb_old_totalprice').css('color', color);
                                
                                $('#bb_historyrange').css('visibility', this.checked ? 'hidden' : 'visible');
                            });

                            $('#bb_changemode').change();

                            $('#bb_placeorders').click(function() {
                                $('.bb_cardcheckbox').prop('disabled', true);
                                $('#bb_controls').hide();
                                placeBuyOrder();
                            });
                        }
                    });
                });
            }).fail(function(jqXHR) {
                setCardStatusError(row, '(' + jqXHR.status + ') ' + jqXHR.statusText);
            });
        }
    });

    var elements = $('.bb_cardname');
    if (elements.length > 0) {
        let largestWidth = 0;
        for (let i = 1; i < elements.length; i++) {
            if (elements[i].offsetWidth > elements[largestWidth].offsetWidth) {
                largestWidth = i;
            }
        }
        $('.bb_cardname').css('width', elements[largestWidth].offsetWidth + 'px');
    }

    // Bind the onchange event to the checkboxes
    $('.bb_cardcheckbox').change(function() {
        $('#bb_changemode').change();
    });
}

function placeBuyOrder() {
    var card = $('.bb_cardrow:not(.buying,.canceling,.skip,.error)')[0];
    if (!card) {
        return;
    }

    card = $(card);

    if (card.data('old_orderid')) {
        card.addClass('canceling');
        setCardStatus(card, g_Messages.status_canceling);

        cancelBuyOrder(card.data('old_orderid'), function(json) {
            card.removeData('old_orderid');
            card.removeClass('canceling');
            setTimeout(placeBuyOrder, 500);
        });
    } else {
        card.addClass('buying');
        setCardStatusInProgress(card, g_Messages.status_placing_order);

        $.post('https://steamcommunity.com/market/createbuyorder/', 
                {"sessionid": g_SessionID, "currency": g_Currency, "appid": 753, "market_hash_name": card.data('hashname'), 
                "price_total": card.data('price_total'), "quantity": card.data('quantity')}).done(function(json) {
            setTimeout(placeBuyOrder, 500);

            if (json.success !== 1) {
                setCardStatusError(card, json.message);
                return;
            }

            card.data('buy_orderid', json.buy_orderid);
            card.data('checks', 0);
            card.data('checks_max', $('#bb_changemode').is(':checked') ? 5 : 2);

            setCardStatusInProgress(card, g_Messages.status_checking);
            checkOrderStatus(card);
        });
    }
}

function checkOrderStatus(card) {
    $.get('/market/getbuyorderstatus/', {"sessionid": g_SessionID, "buy_orderid": card.data('buy_orderid')}).always(function(json) {
        if (json && json.success === 1) {
            if (json.quantity_remaining == 0) {
                setCardStatusSuccess(card, g_Messages.status_purchased);
                return;
            } else {
                card.data('checks', card.data('checks') + 1);
                if (card.data('checks') >= card.data('checks_max')) {
                    setCardStatusSuccess(card, g_Messages.status_placed);
                    return;
                }
            }
        }
        else {
            setCardStatusError(card, g_Messages.error_get_buy_order_status, true);
        }
        
        setTimeout(function() {
            setCardStatusInProgress(card, g_Messages.status_checking + _showProgress(card.data('checks'), card.data('checks_max')));
            checkOrderStatus(card);
        }, 500);
    });
}

function cancelBuyOrder(orderid, callback) {
    $.post('/market/cancelbuyorder/', {"sessionid": g_SessionID, "buy_orderid": orderid}).always(function(json) {
        if (json && json.success === 1) {
            callback(json);
        } else {
            setTimeout(function() {
                cancelBuyOrder(orderid, callback);
            }, 500);
        }
    });
}

function setCardStatus(card, status) {
    var oldStatus = card.find('.bb_cardprice').html();
    var p = oldStatus.indexOf(g_StatusSeparator);
    card.find('.bb_cardprice').html(p >= 0 && status.indexOf(g_StatusSeparator) < 0 ? oldStatus.substring(0, p + g_StatusSeparator.length) + status : status);
    card.css('color', '');
}

function setCardStatusError(card, status, remove_class) {
    setCardStatus(card, status);
    card.find('.bb_cardcheckbox').prop({checked: false, disabled: true});
    card.css({color: g_Colors.red, opacity: 0.8});
    if (remove_class) {
        card.removeClass();
    }
    card.addClass('error');
    
}

function setCardStatusSuccess(card, status) {
    setCardStatus(card, status);
    card.css('color', g_Colors.green);
}

function setCardStatusInProgress(card, status) {
    setCardStatus(card, status);
    card.css('color', g_Colors.gold);
}

function priceToString(price, cents) {
    if (cents) {
        price = parseInt(price, 10) / 100;
    }

    return g_CurrencyInfo.symbol_prefix + price.toFixed(2).replace(".", g_CurrencyInfo.separator) + g_CurrencyInfo.symbol_suffix;
}

function getOptimumPrice(histogram, history, quantity) {
    if (history && history.success && history.prices) {
        if (histogram && histogram.buy_order_graph.length) {
            for (let j = histogram.buy_order_graph.length - 1; j >= 0; j--)
            {
                let price = histogram.buy_order_graph[j][0] * 100;
                let cardsSold = histogram.buy_order_graph[j][1] + quantity;
                for (let i = history.prices.length - 1; i >= 0 && (g_Now - history.prices[i][0]) / 86400000 <= g_HistoryRangeDays; i--) {
                    if (history.prices[i][1] <= price && --cardsSold == 0) {
                        return [price, 0, 'Optimum history price'];
                    }
                }
            }
        } else {
            let price;
            for (let i = history.prices.length - 1; i >= 0 && (g_Now - history.prices[i][0]) / 86400000 <= g_HistoryRangeDays; i--) {
                price = Math.min(history.prices[i][1], price || Number.MAX_VALUE);
            }
            if (price) {
                return [price, 0, 'Lowest history price'];
            }
        }
    }

    if (histogram) {
        if (histogram.highest_buy_order) {
            return [parseInt(histogram.highest_buy_order, 10), 0, 'Highest buy order'];
        }
        if (histogram.lowest_sell_order) {
            return [parseInt(histogram.lowest_sell_order, 10), 0, 'Lowest sell order'];
        }
    }

    return [3, 0, 'No buy/sell orders to analyze'];
}

function getImmediatePrice(histogram, history, quantity) {
    if (!histogram || !histogram.sell_order_graph.length) {
        return getOptimumPrice(histogram, history, quantity);
    }

    var total = 0;
    var quantityLeft = quantity;
    var maxPrice = 0;

    for (let i = 0; i < histogram.sell_order_graph.length && quantityLeft > 0;) {
        maxPrice = histogram.sell_order_graph[i][0] * 100;
        let buyQuantity = Math.min(histogram.sell_order_graph[i][1], quantityLeft);
        total += maxPrice * buyQuantity;
        if ((quantityLeft -= buyQuantity) <= 0) {
            return [maxPrice, maxPrice * quantity - total, 'OK'];
        }
        if (buyQuantity == histogram.sell_order_graph[i][1]) {
            i++;
        }
    }

    return [maxPrice, maxPrice * quantity - total, 'Not enough ' + quantityLeft + ' sell orders'];
}

function _oldOrderData(html, country_code) {
    let orderData = html.match(/<span class="market_listing_inline_buyorder_qty">(\d+) @<\/span>\s*(?:[^\d,.]*)([\d,.]+)(?:[^\d,.]*)\s*<\/span>/);
    let quantity = 0;
    let price = 0;
    let total = 0;

    quantity = orderData[1];
    price = orderData[2];
    if (country_code === 'VN') {
        price = price.replace('.', '').replace(',', '.');
    }
    else {
        price = price.replace(',', '');
    }
    total = Number(quantity * parseFloat(price));
    return [quantity, price, total];
}

function _showProgress(done, total) {
    return ((done/total).toFixed(2) * 100) + "%";
}
