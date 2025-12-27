package fr.blanquer.freeiptv;

import android.os.Handler;
import android.os.Looper;
import android.view.SurfaceView;

import androidx.annotation.OptIn;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.Format;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.TrackGroup;
import androidx.media3.common.Tracks;
import androidx.media3.common.VideoSize;
import androidx.media3.common.text.CueGroup;
import androidx.media3.common.TrackSelectionOverride;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.ui.AspectRatioFrameLayout;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.function.Consumer;

@OptIn(markerClass = UnstableApi.class)
public class NativePlayer {

    private static final int POSITION_UPDATE_INTERVAL_MS = 250;
    private static final String STATE_NONE = "NONE";
    private static final String STATE_IDLE = "IDLE";
    private static final String STATE_READY = "READY";
    private static final String STATE_PLAYING = "PLAYING";
    private static final String STATE_PAUSED = "PAUSED";

    private final Handler mHandler = new Handler(Looper.getMainLooper());
    private ExoPlayer mPlayer;
    private SurfaceView mSurfaceView;
    private AspectRatioFrameLayout mAspectRatioLayout;
    private Consumer<String> mJsCallback;

    private volatile String mState = STATE_NONE;
    private volatile long mCurrentPosition = 0;
    private volatile long mDuration = 0;
    private volatile String mTrackInfoJson = "[]";
    private volatile String mStreamInfoJson = "[]";
    private volatile boolean mSilentSubtitle = false;
    private volatile long mSubtitleOffsetMs = 0;
    private boolean mPreparing = false;
    private boolean mBuffering = false;

    private final Runnable mPositionUpdater = new Runnable() {
        @Override
        public void run() {
            if (mPlayer != null && mPlayer.isPlaying()) {
                mCurrentPosition = mPlayer.getCurrentPosition();
                mDuration = mPlayer.getDuration() == C.TIME_UNSET ? 0 : mPlayer.getDuration();
                evalJs("__avplay_listener.oncurrentplaytime(" + mCurrentPosition + ")");
            }
            mHandler.postDelayed(this, POSITION_UPDATE_INTERVAL_MS);
        }
    };

    public void init(ExoPlayer player, SurfaceView surfaceView, AspectRatioFrameLayout aspectRatioLayout) {
        mPlayer = player;
        mSurfaceView = surfaceView;
        mAspectRatioLayout = aspectRatioLayout;
        mPlayer.setVideoSurfaceView(mSurfaceView);
        AudioAttributes audioAttributes = new AudioAttributes.Builder()
                .setUsage(C.USAGE_MEDIA)
                .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
                .build();
        mPlayer.setAudioAttributes(audioAttributes, true);
        mPlayer.addListener(new PlayerListener());
    }

    public void setJsCallback(Consumer<String> callback) {
        mJsCallback = callback;
    }

    public void open(String url) {
        mHandler.post(() -> {
            mPlayer.setMediaItem(MediaItem.fromUri(url));
            mState = STATE_IDLE;
            mCurrentPosition = 0;
            mDuration = 0;
            mPreparing = false;
            mBuffering = false;
            mTrackInfoJson = "[]";
            mStreamInfoJson = "[]";
        });
    }

    public void prepareAsync() {
        mHandler.post(() -> {
            mPreparing = true;
            mPlayer.prepare();
        });
    }

    public void play() {
        mHandler.post(() -> {
            mPlayer.play();
            mState = STATE_PLAYING;
        });
    }

    public void pause() {
        mHandler.post(() -> {
            mPlayer.pause();
            mState = STATE_PAUSED;
        });
    }

    public void pauseIfPlaying() {
        mHandler.post(() -> {
            if (mPlayer != null && mPlayer.isPlaying()) {
                mPlayer.pause();
                mState = STATE_PAUSED;
            }
        });
    }

    public void stop() {
        mHandler.post(() -> {
            mPlayer.stop();
            mState = STATE_IDLE;
            mHandler.removeCallbacks(mPositionUpdater);
        });
    }

    public void close() {
        mHandler.post(() -> {
            mPlayer.stop();
            mPlayer.clearMediaItems();
            mState = STATE_NONE;
            mCurrentPosition = 0;
            mDuration = 0;
            mPreparing = false;
            mBuffering = false;
            mHandler.removeCallbacks(mPositionUpdater);
        });
    }

    public void seekTo(long positionMs) {
        mHandler.post(() -> mPlayer.seekTo(positionMs));
    }

    public void setSpeed(float speed) {
        mHandler.post(() -> {
            if (speed > 0) {
                mPlayer.setPlaybackSpeed(speed);
            }
        });
    }

    public String getState() {
        return mState;
    }

    public long getCurrentTime() {
        return mCurrentPosition;
    }

    public long getDuration() {
        return mDuration;
    }

    public String getTotalTrackInfo() {
        return mTrackInfoJson;
    }

    public String getCurrentStreamInfo() {
        return mStreamInfoJson;
    }

    public void setSelectTrack(String type, int index) {
        mHandler.post(() -> {
            Tracks tracks = mPlayer.getCurrentTracks();
            int trackType = trackTypeFromString(type);
            int matchIndex = 0;
            for (Tracks.Group group : tracks.getGroups()) {
                if (group.getType() != trackType) {
                    continue;
                }
                for (int i = 0; i < group.length; i++) {
                    if (matchIndex == index) {
                        TrackSelectionOverride override = new TrackSelectionOverride(group.getMediaTrackGroup(), i);
                        mPlayer.setTrackSelectionParameters(
                                mPlayer.getTrackSelectionParameters().buildUpon()
                                        .setOverrideForType(override)
                                        .build());
                        return;
                    }
                    matchIndex++;
                }
            }
        });
    }

    public void setSilentSubtitle(boolean silent) {
        mSilentSubtitle = silent;
    }

    public void setSubtitlePosition(long offsetMs) {
        mSubtitleOffsetMs = offsetMs;
    }

    public void setDisplayMethod(String method) {
        mHandler.post(() -> {
            int resizeMode;
            switch (method) {
                case "PLAYER_DISPLAY_MODE_FULL_SCREEN":
                    resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FILL;
                    break;
                case "PLAYER_DISPLAY_MODE_AUTO_ASPECT_RATIO":
                    resizeMode = AspectRatioFrameLayout.RESIZE_MODE_ZOOM;
                    break;
                default:
                    resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT;
                    break;
            }
            mAspectRatioLayout.setResizeMode(resizeMode);
        });
    }

    public void release() {
        mHandler.removeCallbacks(mPositionUpdater);
        if (mPlayer != null) {
            mPlayer.release();
            mPlayer = null;
        }
    }

    private void evalJs(String js) {
        if (mJsCallback != null) {
            mJsCallback.accept(js);
        }
    }

    private int trackTypeFromString(String type) {
        switch (type) {
            case "AUDIO":
                return C.TRACK_TYPE_AUDIO;
            case "TEXT":
                return C.TRACK_TYPE_TEXT;
            default:
                return C.TRACK_TYPE_VIDEO;
        }
    }

    private void updateTrackInfo() {
        Tracks tracks = mPlayer.getCurrentTracks();
        JSONArray arr = new JSONArray();
        try {
            int audioIndex = 0;
            int textIndex = 0;
            int videoIndex = 0;
            for (Tracks.Group group : tracks.getGroups()) {
                TrackGroup trackGroup = group.getMediaTrackGroup();
                for (int i = 0; i < group.length; i++) {
                    Format format = trackGroup.getFormat(i);
                    JSONObject track = new JSONObject();
                    JSONObject extra = new JSONObject();
                    String language = format.language != null ? format.language : "und";
                    switch (group.getType()) {
                        case C.TRACK_TYPE_AUDIO:
                            track.put("type", "AUDIO");
                            track.put("index", audioIndex++);
                            extra.put("language", language);
                            extra.put("codec", format.codecs != null ? format.codecs : "unknown");
                            extra.put("channels", format.channelCount != Format.NO_VALUE ? format.channelCount : 2);
                            break;
                        case C.TRACK_TYPE_TEXT:
                            track.put("type", "TEXT");
                            track.put("index", textIndex++);
                            extra.put("language", language);
                            extra.put("codec", format.codecs != null ? format.codecs : "srt");
                            break;
                        case C.TRACK_TYPE_VIDEO:
                            track.put("type", "VIDEO");
                            track.put("index", videoIndex++);
                            extra.put("fourCC", format.codecs != null ? format.codecs : "h264");
                            extra.put("Width", format.width != Format.NO_VALUE ? format.width : 0);
                            extra.put("Height", format.height != Format.NO_VALUE ? format.height : 0);
                            break;
                        default:
                            continue;
                    }
                    track.put("extra_info", extra.toString());
                    arr.put(track);
                }
            }
        }
        catch (Exception ex) {
            // ignore
        }
        mTrackInfoJson = arr.toString();
    }

    private void updateStreamInfo(VideoSize videoSize) {
        JSONArray arr = new JSONArray();
        try {
            JSONObject info = new JSONObject();
            info.put("type", "VIDEO");
            info.put("extra_info", "{\"Width\":" + videoSize.width + ",\"Height\":" + videoSize.height + "}");
            arr.put(info);
        }
        catch (Exception ex) {
            // ignore
        }
        mStreamInfoJson = arr.toString();
        if (videoSize.width > 0 && videoSize.height > 0) {
            float ratio = (float) videoSize.width * videoSize.pixelWidthHeightRatio / videoSize.height;
            mAspectRatioLayout.setAspectRatio(ratio);
        }
    }

    private class PlayerListener implements Player.Listener {
        @Override
        public void onPlaybackStateChanged(int playbackState) {
            switch (playbackState) {
                case Player.STATE_BUFFERING:
                    mBuffering = true;
                    evalJs("__avplay_listener.onbufferingstart()");
                    break;
                case Player.STATE_READY:
                    if (mPreparing) {
                        mPreparing = false;
                        mState = STATE_READY;
                        mDuration = mPlayer.getDuration() == C.TIME_UNSET ? 0 : mPlayer.getDuration();
                        evalJs("__avplay_prepare_success()");
                    }
                    if (mBuffering) {
                        mBuffering = false;
                        evalJs("__avplay_listener.onbufferingcomplete()");
                    }
                    mHandler.removeCallbacks(mPositionUpdater);
                    mHandler.post(mPositionUpdater);
                    break;
                case Player.STATE_ENDED:
                    mState = STATE_PAUSED;
                    evalJs("__avplay_listener.onstreamcompleted()");
                    mHandler.removeCallbacks(mPositionUpdater);
                    break;
                case Player.STATE_IDLE:
                    break;
            }
        }

        @Override
        public void onPlayerError(PlaybackException error) {
            String msg = error.getMessage() != null ? error.getMessage() : "Playback error";
            String escapedMsg = msg.replace("\\", "\\\\").replace("'", "\\'").replace("\n", " ");
            if (mPreparing) {
                mPreparing = false;
                evalJs("__avplay_prepare_error('" + escapedMsg + "')");
            }
            else {
                evalJs("__avplay_listener.onerror('" + escapedMsg + "')");
            }
        }

        @Override
        public void onTracksChanged(Tracks tracks) {
            updateTrackInfo();
        }

        @Override
        public void onVideoSizeChanged(VideoSize videoSize) {
            updateStreamInfo(videoSize);
        }

        @Override
        public void onCues(CueGroup cueGroup) {
            if (mSilentSubtitle) {
                return;
            }
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < cueGroup.cues.size(); i++) {
                if (i > 0) {
                    sb.append('\n');
                }
                CharSequence text = cueGroup.cues.get(i).text;
                if (text != null) {
                    sb.append(text);
                }
            }
            String subtitleText = sb.toString()
                    .replace("\\", "\\\\")
                    .replace("'", "\\'")
                    .replace("\n", "\\n");
            evalJs("__avplay_listener.onsubtitlechange(0,'" + subtitleText + "','','')");
        }
    }
}
