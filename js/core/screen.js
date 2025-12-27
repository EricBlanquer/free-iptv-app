/**
 * Screen Manager Module
 * Handles screen transitions, loading states, toasts, and disclaimer
 */

IPTVApp.prototype.showDisclaimer = function() {
    var self = this;
    this.setHidden('disclaimer-modal', false);
    var btn = document.getElementById('disclaimer-accept-btn');
    if (btn) {
        btn.classList.add('focused');
        btn.focus();
    }
    this.disclaimerKeyHandler = function(e) {
        if (e.keyCode === 13) {
            self.acceptDisclaimer();
        }
        e.preventDefault();
        e.stopPropagation();
    };
    document.addEventListener('keydown', this.disclaimerKeyHandler, true);
};

IPTVApp.prototype.hideDisclaimer = function() {
    this.setHidden('disclaimer-modal', true);
    if (this.disclaimerKeyHandler) {
        document.removeEventListener('keydown', this.disclaimerKeyHandler, true);
        this.disclaimerKeyHandler = null;
    }
};

IPTVApp.prototype.bindDisclaimerButton = function() {
    var self = this;
    var btn = document.getElementById('disclaimer-accept-btn');
    if (btn) {
        btn.addEventListener('click', function() {
            self.acceptDisclaimer();
        });
    }
};

IPTVApp.prototype.acceptDisclaimer = function() {
    try {
        localStorage.setItem('disclaimerAccepted', 'true');
    }
    catch (e) {}
    this.hideDisclaimer();
    this.startApp();
};

IPTVApp.prototype.resetScreens = function() {
    var screens = document.querySelectorAll('.screen');
    for (var i = 0; i < screens.length; i++) {
        screens[i].classList.remove('active');
    }
    document.getElementById('home-screen').classList.add('active');
    this.setHidden('player-title', true);
    this.setHidden('player-top-right', true);
    this.setHidden('player-overlay', true);
    this.currentScreen = 'home';
};

IPTVApp.prototype.showScreen = function(screen) {
    window.log('SCREEN ' + screen);
    document.querySelectorAll('.screen').forEach(function(s) {
        s.classList.remove('active');
    });
    document.getElementById(screen + '-screen').classList.add('active');
    this.currentScreen = screen;
};

IPTVApp.prototype.showLoading = function(show, posterUrl) {
    var backdrop = document.getElementById('loading-backdrop');
    var posterBg = backdrop.querySelector('.poster-bg');
    document.getElementById('loading').classList.toggle('hidden', !show);
    window.log('showLoading: show=' + show + ' currentTmdbBackdrop=' + (this.currentTmdbBackdrop ? 'yes' : 'no') + ' posterUrl=' + (posterUrl ? 'yes' : 'no'));
    if (!show) {
        var imgDivs = document.querySelectorAll('#loading-backdrop .backdrop-img');
        for (var i = 0; i < imgDivs.length; i++) {
            imgDivs[i].style.backgroundImage = '';
        }
        backdrop.classList.remove('poster-mode', 'tmdb-mode');
        posterBg.style.backgroundImage = '';
    }
    else if (this.currentTmdbBackdrop) {
        backdrop.classList.add('poster-mode', 'tmdb-mode');
        this.setBackgroundImage(posterBg, this.currentTmdbBackdrop);
    }
    else if (posterUrl) {
        backdrop.classList.add('poster-mode');
        backdrop.classList.remove('tmdb-mode');
        this.setBackgroundImage(posterBg, posterUrl);
    }
    else {
        backdrop.classList.remove('poster-mode', 'tmdb-mode');
        posterBg.style.backgroundImage = '';
    }
};

IPTVApp.prototype.showToast = function(message, duration, isError) {
    duration = duration || 3000;
    var existing = document.getElementById('toast-message');
    if (existing) existing.remove();
    var toast = document.createElement('div');
    toast.id = 'toast-message';
    if (isError) {
        toast.style.cssText = 'position:fixed;bottom:40px;right:40px;background-color:rgba(180,30,30,0.25);color:#fff;padding:20px 40px;border-radius:8px;font-size:24px;z-index:10000;';
    }
    else {
        toast.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.9);color:#fff;padding:30px 50px;border-radius:12px;font-size:28px;z-index:10000;text-align:center;';
    }
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(function() {
        if (toast.parentNode) toast.remove();
    }, duration);
};
