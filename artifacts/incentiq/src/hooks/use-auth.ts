import { useGetMe, getGetMeQueryKey, useLogout } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useEffect } from "react";

export function useAuth() {
  const { data: user, error, isLoading } = useGetMe({
    query: {
      retry: false,
    }
  });

  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const logoutMutation = useLogout();

  const logout = () => {
    localStorage.removeItem("incentiq_token");
    queryClient.setQueryData(getGetMeQueryKey(), null);
    setLocation("/login");
  };

  return {
    user,
    isLoading,
    error,
    logout,
  };
}
