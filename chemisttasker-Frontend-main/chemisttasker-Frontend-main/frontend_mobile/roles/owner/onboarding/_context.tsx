import React, { createContext, useContext, useState, ReactNode } from 'react';

interface OnboardingData {
    phone_number: string;
    role: string;
    ahpra_number: string;
    chain_pharmacy: boolean;
    profile_photo: string | null;
}

interface OnboardingContextType {
    data: OnboardingData;
    updateData: (updates: Partial<OnboardingData>) => void;
}

const defaultData: OnboardingData = {
    phone_number: '',
    role: 'MANAGER',
    ahpra_number: '',
    chain_pharmacy: false,
    profile_photo: null,
};

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

export function OnboardingProvider({ children }: { children: ReactNode }) {
    const [data, setData] = useState<OnboardingData>(defaultData);

    const updateData = (updates: Partial<OnboardingData>) => {
        setData(prev => ({ ...prev, ...updates }));
    };

    return (
        <OnboardingContext.Provider value={{ data, updateData }}>
            {children}
        </OnboardingContext.Provider>
    );
}

export function useOnboarding() {
    const context = useContext(OnboardingContext);
    if (context === undefined) {
        throw new Error('useOnboarding must be used within an OnboardingProvider');
    }
    return context;
}

// Default export to satisfy Expo Router route resolution when scanning files.
export default function OnboardingContextProviderWrapper({ children }: { children?: ReactNode }) {
    return children ? <OnboardingProvider>{children}</OnboardingProvider> : null;
}
