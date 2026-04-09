/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   main.tsx                                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/08 19:03:43 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import './app/styles/global.css';

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
