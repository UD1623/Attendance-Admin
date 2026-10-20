import { useState, useEffect } from 'react';
import { collection, onSnapshot, DocumentData } from 'firebase/firestore';
import { db } from './firebase';
import { getDevCollection } from './devData';

export function useSyncedCollection<T extends DocumentData>(
  collectionName: string,
  idField: string = 'id'
): { data: T[]; loading: boolean; isUsingLocalFallback: boolean } {
  const [data, setData] = useState<T[]>(() => getDevCollection<T>(collectionName));
  const [loading, setLoading] = useState<boolean>(true);
  const [isUsingLocalFallback, setIsUsingLocalFallback] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;

    // Load initial local data
    const localItems = getDevCollection<T>(collectionName);
    if (localItems && localItems.length > 0) {
      setData(localItems);
      setLoading(false);
    }

    // Subscribe to local store update events
    const handleLocalUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<{ collectionName: string }>;
      if (customEvent.detail?.collectionName === collectionName && isMounted) {
        const updated = getDevCollection<T>(collectionName);
        setData(updated);
      }
    };

    window.addEventListener('dev-store-updated', handleLocalUpdate);

    // Also attempt live Firestore subscription with graceful error handling
    let unsubscribeFirestore: (() => void) | null = null;
    try {
      unsubscribeFirestore = onSnapshot(
        collection(db, collectionName),
        (snapshot) => {
          if (!isMounted) return;
          if (!snapshot.empty) {
            const remoteDocs = snapshot.docs.map((doc) => ({
              [idField]: doc.id,
              ...doc.data(),
            })) as unknown as T[];
            setData(remoteDocs);
            setIsUsingLocalFallback(false);
          } else {
            // Empty remote collection - maintain local demo data
            const fallback = getDevCollection<T>(collectionName);
            setData(fallback);
            setIsUsingLocalFallback(true);
          }
          setLoading(false);
        },
        (error) => {
          // Firebase emulator is offline or unreachable - seamlessly fallback to local dev store
          if (isMounted) {
            console.info(`[DevSync] Using local store for '${collectionName}' (Remote state: ${error.code || 'offline'})`);
            const fallback = getDevCollection<T>(collectionName);
            setData(fallback);
            setIsUsingLocalFallback(true);
            setLoading(false);
          }
        }
      );
    } catch {
      if (isMounted) {
        setIsUsingLocalFallback(true);
        setLoading(false);
      }
    }

    return () => {
      isMounted = false;
      window.removeEventListener('dev-store-updated', handleLocalUpdate);
      if (unsubscribeFirestore) {
        unsubscribeFirestore();
      }
    };
  }, [collectionName, idField]);

  return { data, loading, isUsingLocalFallback };
}
