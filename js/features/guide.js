/**
 * TV Guide Module
 * Handles EPG display, navigation, and program selection
 */

IPTVApp.prototype.showTVGuide = function() {
    var self = this;
    this.showScreen('guide');
    this.currentScreen = 'guide';
    this.guideChannels = [];
    this.guideEpgData = {};
    this.guideRowIndex = 0;
    this.guideProgramIndex = 0;
    var allStreams = this.getStreams('live');
    var tntChannels = I18n.getTntChannels();
    var tntStreams = this.getTntStreams(allStreams, tntChannels);
    var otherStreams = allStreams.filter(function(s) {
        return tntStreams.indexOf(s) === -1;
    });
    this.guideChannels = tntStreams.concat(otherStreams).slice(0, 15);
    this.renderGuideTimeBar();
    this.loadGuideEPG();
};

IPTVApp.prototype.renderGuideTimeBar = function() {
    var container = document.getElementById('guide-time-bar');
    var now = new Date();
    var html = '';
    for (var i = 0; i < 12; i++) {
        var hour = (now.getHours() + i) % 24;
        var timeStr = (hour < 10 ? '0' : '') + hour + 'h00';
        var isCurrent = (i === 0);
        html += '<div class="guide-time-slot' + (isCurrent ? ' current' : '') + '">' + timeStr + '</div>';
    }
    container.innerHTML = html;
};

IPTVApp.prototype.loadGuideEPG = function() {
    var self = this;
    this.showLoading(true);
    var loaded = 0;
    this.guideChannels.forEach(function(ch, idx) {
        self.api.getShortEPG(ch.stream_id, 999).then(function(data) {
            self.guideEpgData[ch.stream_id] = data.epg_listings || [];
            loaded++;
            if (loaded === self.guideChannels.length) {
                self.showLoading(false);
                self.renderGuideGrid();
            }
        }).catch(function(err) {
            self.guideEpgData[ch.stream_id] = [];
            loaded++;
            if (loaded === self.guideChannels.length) {
                self.showLoading(false);
                self.renderGuideGrid();
            }
        });
    });
};

IPTVApp.prototype.renderGuideGrid = function() {
    var self = this;
    var logosContainer = document.getElementById('guide-logos');
    var gridContainer = document.getElementById('guide-grid');
    var logosHtml = '';
    var gridHtml = '';
    var now = Math.floor(Date.now() / 1000);
    var scrollArea = document.getElementById('guide-scroll-area');
    var viewportWidth = scrollArea ? scrollArea.clientWidth : 1760;
    var pixelsPerSecond = viewportWidth / 3600;
    var nowDate = new Date();
    var viewStartTime = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate(), nowDate.getHours(), 0, 0).getTime() / 1000;
    this.guideViewStartTime = viewStartTime;
    this.guidePixelsPerSecond = pixelsPerSecond;
    var maxEndTime = viewStartTime + 18 * 3600;
    for (var i = 0; i < this.guideChannels.length; i++) {
        var epg = this.guideEpgData[this.guideChannels[i].stream_id] || [];
        for (var j = 0; j < epg.length; j++) {
            var endTs = parseInt(epg[j].stop_timestamp, 10);
            if (endTs > maxEndTime) maxEndTime = endTs;
        }
    }
    var totalHours = Math.ceil((maxEndTime - viewStartTime) / 3600);
    this.renderGuideTimeBarScaled(pixelsPerSecond, totalHours);
    for (var i = 0; i < this.guideChannels.length; i++) {
        var ch = this.guideChannels[i];
        var epg = this.guideEpgData[ch.stream_id] || [];
        logosHtml += '<div class="guide-channel-logo" data-row="' + i + '" style="background-image:url(\'' + (ch.stream_icon || '') + '\')"></div>';
        gridHtml += '<div class="guide-programs-row" data-row="' + i + '">';
        var mergedProgs = [];
        for (var j = 0; j < epg.length; j++) {
            var prog = epg[j];
            var progStart = parseInt(prog.start_timestamp, 10);
            var progEnd = parseInt(prog.stop_timestamp, 10);
            if (progEnd <= viewStartTime) continue;
            var title = prog.title || '';
            try {
                title = decodeURIComponent(escape(atob(title)));
                title = title.replace(/\\"/g, '"').replace(/\\'/g, "'");
            } catch (e) {}
            if (!title || !title.trim()) title = '---';
            var last = mergedProgs[mergedProgs.length - 1];
            if (last && last.title === title) {
                last.progEnd = Math.max(last.progEnd, progEnd);
            }
            else if (last && progStart < last.progEnd) {
                if (progEnd > last.progEnd) {
                    mergedProgs.push({ progStart: last.progEnd, progEnd: progEnd, title: title, desc: prog.description || '' });
                }
            }
            else {
                mergedProgs.push({ progStart: progStart, progEnd: progEnd, title: title, desc: prog.description || '' });
            }
        }
        var progIdx = 0;
        for (var j = 0; j < mergedProgs.length; j++) {
            var mp = mergedProgs[j];
            var isLive = (now >= mp.progStart && now < mp.progEnd);
            var startDate = new Date(mp.progStart * 1000);
            var endDate = new Date(mp.progEnd * 1000);
            var timePrefix = (mp.progStart < viewStartTime) ? '< ' : '';
            var timeStr = timePrefix + (startDate.getHours() < 10 ? '0' : '') + startDate.getHours() + 'h' +
                          (startDate.getMinutes() < 10 ? '0' : '') + startDate.getMinutes();
            var displayStart = Math.max(mp.progStart, viewStartTime);
            var leftPos = (displayStart - viewStartTime) * pixelsPerSecond;
            var duration = mp.progEnd - displayStart;
            var width = duration * pixelsPerSecond;
            gridHtml += '<div class="guide-program-card" data-row="' + i + '" data-prog="' + progIdx + '" ';
            gridHtml += 'style="position:absolute;left:' + leftPos + 'px;width:' + width + 'px;" ';
            gridHtml += 'data-start="' + mp.progStart + '" data-end="' + mp.progEnd + '" ';
            gridHtml += 'data-stream-id="' + ch.stream_id + '" ';
            gridHtml += 'data-title="' + mp.title.replace(/"/g, '&quot;') + '" ';
            gridHtml += 'data-desc="' + mp.desc.replace(/"/g, '&quot;') + '">';
            gridHtml += '<div class="guide-program-time">' + timeStr + '</div>';
            gridHtml += '<div class="guide-program-image">';
            gridHtml += '<span class="guide-program-title-inner">' + mp.title + '</span>';
            gridHtml += '</div>';
            gridHtml += '</div>';
            progIdx++;
        }
        if (progIdx === 0) {
            gridHtml += '<div style="padding:20px;color:#666;">' + I18n.t('guide.noProgram', 'No program') + '</div>';
        }
        gridHtml += '</div>';
    }
    logosContainer.innerHTML = logosHtml;
    gridContainer.innerHTML = gridHtml;
    var indicator = document.createElement('div');
    indicator.id = 'guide-time-indicator';
    var indicatorLabel = document.createElement('div');
    indicatorLabel.id = 'guide-time-indicator-label';
    indicator.appendChild(indicatorLabel);
    gridContainer.appendChild(indicator);
    this.updateGuideTimeIndicator();
    this.startGuideTimeIndicator();
    this.setupGuideScrollSync();
    if (scrollArea) {
        scrollArea.scrollLeft = 0;
        scrollArea.scrollTop = 0;
    }
    this.updateGuideDayIndicator();
    this.updateGuideFocus(true);
};

IPTVApp.prototype.updateGuideTimeIndicator = function() {
    var indicator = document.getElementById('guide-time-indicator');
    if (!indicator) return;
    var scrollArea = document.getElementById('guide-scroll-area');
    var scrollLeft = scrollArea ? scrollArea.scrollLeft : 0;
    var viewWidth = scrollArea ? scrollArea.clientWidth : 1920;
    var now = Math.floor(Date.now() / 1000);
    var leftPos = (now - this.guideViewStartTime) * this.guidePixelsPerSecond;
    var visibleLeft = scrollLeft;
    var visibleRight = scrollLeft + viewWidth;
    if (leftPos < visibleLeft || leftPos > visibleRight) {
        indicator.style.display = 'none';
    }
    else {
        indicator.style.display = 'block';
        indicator.style.left = leftPos + 'px';
        var label = document.getElementById('guide-time-indicator-label');
        if (label) {
            var nowDate = new Date();
            var h = nowDate.getHours();
            var m = nowDate.getMinutes();
            label.textContent = (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
            var firstRow = document.querySelector('.guide-programs-row[data-row="0"]');
            var showLabel = true;
            if (firstRow) {
                var cards = firstRow.querySelectorAll('.guide-program-card');
                for (var i = 0; i < cards.length; i++) {
                    var cardLeft = parseFloat(cards[i].style.left) || 0;
                    var cardWidth = parseFloat(cards[i].style.width) || 0;
                    var timeDisplayEnd = cardLeft + 55;
                    if (leftPos >= cardLeft && leftPos <= timeDisplayEnd) {
                        showLabel = false;
                        break;
                    }
                }
            }
            label.style.display = showLabel ? 'block' : 'none';
        }
    }
};

IPTVApp.prototype.startGuideTimeIndicator = function() {
    var self = this;
    if (this.guideTimeIndicatorInterval) {
        clearInterval(this.guideTimeIndicatorInterval);
    }
    this.guideTimeIndicatorInterval = setInterval(function() {
        self.updateGuideTimeIndicator();
    }, 60000);
};

IPTVApp.prototype.stopGuideTimeIndicator = function() {
    if (this.guideTimeIndicatorInterval) {
        clearInterval(this.guideTimeIndicatorInterval);
        this.guideTimeIndicatorInterval = null;
    }
};

IPTVApp.prototype.renderGuideTimeBarScaled = function(pixelsPerSecond, totalHours) {
    var container = document.getElementById('guide-time-bar');
    var startTime = this.guideViewStartTime * 1000;
    var html = '';
    var hourWidth = 3600 * pixelsPerSecond;
    for (var i = 0; i < totalHours; i++) {
        var slotDate = new Date(startTime + i * 3600000);
        var hour = slotDate.getHours();
        var timeStr = (hour < 10 ? '0' : '') + hour + 'h00';
        var isCurrent = (i === 0);
        html += '<div class="guide-time-slot' + (isCurrent ? ' current' : '') + '" style="width:' + hourWidth + 'px;">' + timeStr + '</div>';
    }
    container.innerHTML = html;
    this.updateGuideDayIndicator();
};

IPTVApp.prototype.updateGuideDayIndicator = function() {
    var indicator = document.getElementById('guide-day-indicator');
    if (!indicator) return;
    var scrollArea = document.getElementById('guide-scroll-area');
    var scrollLeft = scrollArea ? scrollArea.scrollLeft : 0;
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    var currentTime = this.guideViewStartTime + (scrollLeft / this.guidePixelsPerSecond);
    var currentDate = new Date(currentTime * 1000);
    var currentDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate()).getTime();
    var dayDiff = Math.floor((currentDay - today) / 86400000);
    var dayLabel = '';
    if (dayDiff === 0) {
        dayLabel = I18n.t('guide.today', 'Today');
    }
    else if (dayDiff === 1) {
        dayLabel = I18n.t('guide.tomorrow', 'Tomorrow');
    }
    else {
        var days = I18n.t('guide.days', ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
        dayLabel = days[currentDate.getDay()] + ' ' + currentDate.getDate();
    }
    var hour = currentDate.getHours();
    var timeStr = (hour < 10 ? '0' : '') + hour + 'h00';
    indicator.textContent = dayLabel + ' - ' + timeStr;
};

IPTVApp.prototype.updateGuidePrefixes = function() {
    var scrollArea = document.getElementById('guide-scroll-area');
    if (!scrollArea) return;
    var scrollLeft = scrollArea.scrollLeft;
    var currentViewTime = this.guideViewStartTime + (scrollLeft / this.guidePixelsPerSecond);
    var cards = document.querySelectorAll('.guide-program-card');
    for (var i = 0; i < cards.length; i++) {
        var card = cards[i];
        var progStart = parseInt(card.dataset.start, 10);
        var timeDiv = card.querySelector('.guide-program-time');
        if (!timeDiv) continue;
        var startDate = new Date(progStart * 1000);
        var prefix = (progStart < currentViewTime) ? '< ' : '';
        var timeStr = prefix + (startDate.getHours() < 10 ? '0' : '') + startDate.getHours() + 'h' +
                      (startDate.getMinutes() < 10 ? '0' : '') + startDate.getMinutes();
        timeDiv.textContent = timeStr;
    }
};

IPTVApp.prototype.setupGuideScrollSync = function() {
    var scrollArea = document.getElementById('guide-scroll-area');
    var logosContainer = document.getElementById('guide-logos');
    var self = this;
    scrollArea.onscroll = function() {
        logosContainer.scrollTop = scrollArea.scrollTop;
        self.updateStickyTitles();
        self.updateGuideDayIndicator();
    };
};

IPTVApp.prototype.updateStickyTitles = function() {
    var scrollArea = document.getElementById('guide-scroll-area');
    var scrollLeft = scrollArea.scrollLeft;
    var cards = document.querySelectorAll('.guide-program-card');
    cards.forEach(function(card) {
        var cardLeft = card.offsetLeft;
        var cardWidth = card.offsetWidth;
        var titleInner = card.querySelector('.guide-program-title-inner');
        var timeDiv = card.querySelector('.guide-program-time');
        if (!titleInner) return;
        if (cardWidth < 150) {
            titleInner.style.transform = '';
            if (timeDiv) timeDiv.style.transform = '';
            return;
        }
        var cardRight = cardLeft + cardWidth;
        var visibleInCard = cardRight - scrollLeft;
        if (cardLeft < scrollLeft && visibleInCard > 100) {
            var offset = scrollLeft - cardLeft;
            var maxOffset = cardWidth - 150;
            offset = Math.min(offset, Math.max(0, maxOffset));
            titleInner.style.transform = 'translateX(' + offset + 'px)';
            if (timeDiv) timeDiv.style.transform = 'translateX(' + offset + 'px)';
        }
        else {
            titleInner.style.transform = '';
            if (timeDiv) timeDiv.style.transform = '';
        }
    });
};

IPTVApp.prototype.updateGuideFocus = function(skipHorizontalScroll) {
    var cards = document.querySelectorAll('.guide-program-card');
    cards.forEach(function(c) { c.classList.remove('focused'); });
    var logos = document.querySelectorAll('.guide-channel-logo');
    logos.forEach(function(l) { l.classList.remove('focused'); });
    var rows = document.querySelectorAll('.guide-programs-row');
    rows.forEach(function(r) { r.classList.remove('focused'); });
    var row = document.querySelector('.guide-programs-row[data-row="' + this.guideRowIndex + '"]');
    if (row) {
        row.classList.add('focused');
        var progs = row.querySelectorAll('.guide-program-card');
        if (progs.length > 0) {
            if (this.guideProgramIndex >= progs.length) {
                this.guideProgramIndex = progs.length - 1;
            }
            if (this.guideProgramIndex < 0) {
                this.guideProgramIndex = 0;
            }
            progs[this.guideProgramIndex].classList.add('focused');
        }
    }
    var focusedLogo = document.querySelector('.guide-channel-logo[data-row="' + this.guideRowIndex + '"]');
    if (focusedLogo) {
        focusedLogo.classList.add('focused');
    }
    var scrollArea = document.getElementById('guide-scroll-area');
    var focusedRow = document.querySelector('.guide-programs-row[data-row="' + this.guideRowIndex + '"]');
    if (focusedRow && scrollArea) {
        var rowTop = focusedRow.offsetTop;
        var rowHeight = focusedRow.offsetHeight;
        var scrollTop = scrollArea.scrollTop;
        var areaHeight = scrollArea.offsetHeight;
        if (rowTop < scrollTop + 50) {
            scrollArea.scrollTop = rowTop - 50;
        }
        if (rowTop + rowHeight > scrollTop + areaHeight - 50) {
            scrollArea.scrollTop = rowTop + rowHeight - areaHeight + 50;
        }
        if (!skipHorizontalScroll) {
            var focusedCard = focusedRow.querySelector('.guide-program-card.focused');
            if (focusedCard) {
                scrollArea.scrollLeft = focusedCard.offsetLeft;
            }
        }
    }
    var focusedCard = document.querySelector('.guide-program-card.focused');
    var infoTime = document.getElementById('guide-info-time');
    var infoTitle = document.getElementById('guide-info-title');
    if (focusedCard && infoTime && infoTitle) {
        var startTs = parseInt(focusedCard.dataset.start, 10);
        var endTs = parseInt(focusedCard.dataset.end, 10);
        var startDate = new Date(startTs * 1000);
        var endDate = new Date(endTs * 1000);
        var timeStr = (startDate.getHours() < 10 ? '0' : '') + startDate.getHours() + 'h' +
                      (startDate.getMinutes() < 10 ? '0' : '') + startDate.getMinutes() + ' - ' +
                      (endDate.getHours() < 10 ? '0' : '') + endDate.getHours() + 'h' +
                      (endDate.getMinutes() < 10 ? '0' : '') + endDate.getMinutes();
        infoTime.textContent = timeStr;
        infoTitle.textContent = focusedCard.dataset.title || '';
        this.clearMarquee(infoTitle);
        this.applyMarqueeLoop(infoTitle, infoTitle.parentElement.clientWidth - 20);
        this.guideFocusedTime = startTs;
    }
};

IPTVApp.prototype.findProgramAtTime = function() {
    var row = document.querySelector('.guide-programs-row[data-row="' + this.guideRowIndex + '"]');
    if (!row) return;
    var progs = row.querySelectorAll('.guide-program-card');
    if (progs.length === 0) return;
    var scrollArea = document.getElementById('guide-scroll-area');
    var scrollLeft = scrollArea ? scrollArea.scrollLeft : 0;
    var targetTime = this.guideViewStartTime + (scrollLeft / this.guidePixelsPerSecond);
    for (var i = 0; i < progs.length; i++) {
        var start = parseInt(progs[i].dataset.start, 10);
        var end = parseInt(progs[i].dataset.end, 10);
        if (targetTime >= start && targetTime < end) {
            this.guideProgramIndex = i;
            return;
        }
    }
    for (var i = 0; i < progs.length; i++) {
        var start = parseInt(progs[i].dataset.start, 10);
        if (start >= targetTime) {
            this.guideProgramIndex = i;
            return;
        }
    }
    this.guideProgramIndex = progs.length - 1;
};

IPTVApp.prototype.navigateGuide = function(direction) {
    var scrollArea = document.getElementById('guide-scroll-area');
    var row = document.querySelector('.guide-programs-row[data-row="' + this.guideRowIndex + '"]');
    var progs = row ? row.querySelectorAll('.guide-program-card') : [];
    switch (direction) {
        case 'up':
            if (this.guideRowIndex > 0) {
                this.guideRowIndex--;
                this.findProgramAtTime();
                this.updateGuideFocus(true);
            }
            break;
        case 'down':
            if (this.guideRowIndex < this.guideChannels.length - 1) {
                this.guideRowIndex++;
                this.findProgramAtTime();
                this.updateGuideFocus(true);
            }
            break;
        case 'left':
            if (scrollArea) {
                if (progs.length > 0) {
                    var prevIndex = this.guideProgramIndex - 1;
                    if (prevIndex >= 0) {
                        var prevProg = progs[prevIndex];
                        var progLeft = parseFloat(prevProg.style.left) || 0;
                        var visibleLeft = scrollArea.scrollLeft;
                        var progRight = progLeft + (parseFloat(prevProg.style.width) || 0);
                        if (progRight > visibleLeft) {
                            this.guideProgramIndex = prevIndex;
                            this.updateGuideFocus(true);
                            return;
                        }
                    }
                }
                var hourPixels = 3600 * this.guidePixelsPerSecond;
                var newScrollL = Math.max(0, scrollArea.scrollLeft - hourPixels);
                scrollArea.scrollLeft = newScrollL;
                this.findProgramAtTime();
                this.updateGuideFocus(true);
                this.updateGuidePrefixes();
                this.updateGuideTimeIndicator();
                this.updateGuideDayIndicator();
            }
            break;
        case 'right':
            if (scrollArea) {
                if (progs.length > 0) {
                    var nextIndex = this.guideProgramIndex + 1;
                    if (nextIndex < progs.length) {
                        var nextProg = progs[nextIndex];
                        var progLeftR = parseFloat(nextProg.style.left) || 0;
                        var visibleRight = scrollArea.scrollLeft + scrollArea.clientWidth;
                        if (progLeftR < visibleRight) {
                            this.guideProgramIndex = nextIndex;
                            this.updateGuideFocus(true);
                            return;
                        }
                    }
                }
                var hourPixelsR = 3600 * this.guidePixelsPerSecond;
                var maxScroll = scrollArea.scrollWidth - scrollArea.clientWidth;
                var newScrollR = Math.min(maxScroll, scrollArea.scrollLeft + hourPixelsR);
                scrollArea.scrollLeft = newScrollR;
                this.findProgramAtTime();
                this.updateGuideFocus(true);
                this.updateGuidePrefixes();
                this.updateGuideTimeIndicator();
                this.updateGuideDayIndicator();
            }
            break;
    }
};

IPTVApp.prototype.selectGuideProgram = function() {
    var self = this;
    var focusedCard = document.querySelector('.guide-program-card.focused');
    if (!focusedCard) return;
    var streamId = focusedCard.dataset.streamId;
    var ch = this.guideChannels.find(function(c) { return self.sameId(c.stream_id, streamId); });
    if (!ch) return;
    var now = Math.floor(Date.now() / 1000);
    var progStart = parseInt(focusedCard.dataset.start, 10);
    var progEnd = parseInt(focusedCard.dataset.end, 10);
    if (progEnd < now && (ch.tv_archive === 1 || ch.tv_archive === '1')) {
        var duration = Math.ceil((progEnd - progStart) / 60);
        var progDate = new Date(progStart * 1000);
        var todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        var progDayStart = new Date(progDate.getFullYear(), progDate.getMonth(), progDate.getDate()).getTime() / 1000;
        var daysAgo = Math.floor((todayStart.getTime() / 1000 - progDayStart) / 86400);
        var epgData = this.guideEpgData[streamId] || [];
        var progDayEnd = progDayStart + 86400;
        var dayPrograms = epgData.filter(function(p) {
            var pStart = parseInt(p.start_timestamp, 10);
            return pStart >= progDayStart && pStart < progDayEnd;
        });
        var programIndex = 0;
        for (var i = 0; i < dayPrograms.length; i++) {
            if (parseInt(dayPrograms[i].start_timestamp, 10) === progStart) {
                programIndex = i;
                break;
            }
        }
        this.playCatchup(ch, progStart, duration, 'm3u8', null, null, dayPrograms, programIndex, daysAgo);
        return;
    }
    this.playStream(ch.stream_id, 'live', ch);
};
