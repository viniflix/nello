import { describe, expect, it } from 'vitest';
import { scopeFeedItems, scopeFeedStates, canRetryFeedFailure } from '@/lib/supabase/feed-scope';

describe('feed care lifecycle', () => {
  const patients=[{id:'active',care_episode_id:'episode-new'}];
  it('excludes archived patients in every item category without dropping general tasks', () => {
    for (const type of ['pending','low_adherence','appointment','payment_pending','birthday','lab_high_risk','activity']) {
      expect(scopeFeedItems([{patientId:'archived',type},{patientId:'active',type},{type}],patients))
        .toEqual([{patientId:'active',type,careEpisodeId:'episode-new'},{type,careEpisodeId:null}]);
    }
  });
  it('does not transplant a failed old snapshot into a restarted episode', () => {
    expect(scopeFeedItems([{patientId:'active',careEpisodeId:'episode-old'},
      {patientId:'active',careEpisodeId:'episode-new'},{patientId:'archived',careEpisodeId:'old'}],patients,{preserveEpisode:true}))
      .toEqual([{patientId:'active',careEpisodeId:'episode-new'}]);
  });
  it('does not hydrate a restarted feed with an old resolved state returned by a slower read', () => {
    const old={patient_id:'active',status:'resolved',metadata:{care_episode_id:'episode-old'}};
    const current={patient_id:'active',status:'open',metadata:{care_episode_id:'episode-new'}};
    const general={patient_id:null,status:'resolved'};
    expect(scopeFeedStates([old,current,general],patients)).toEqual([current,general]);
  });
  it.each(['NETWORK_FAILURE','OFFLINE','RETRY_LIMIT','PT409','57014','PGRST003',null])('allows recoverable failure %s', code=>expect(canRetryFeedFailure(code)).toBe(true));
  it.each(['42501','22023','23503','SESSION_CHANGED'])('does not offer an endless retry for %s',code=>expect(canRetryFeedFailure(code)).toBe(false));
});
